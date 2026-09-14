import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  EmbedBuilder,
  ModalBuilder,
  PermissionFlagsBits,
  RoleSelectMenuBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { config } from '#config/config';
import {
  calculateCategorySync,
  categoryKey,
  isAdministrator,
  isSafeRole,
  isStaleInteractionError,
  parseCustomId,
  tryLock,
  validatePanel,
} from '#services/selfRoles/logic';
import { panelStore } from '#services/store';

const drafts = new Map();
const activeInteractions = new Set();
const activePublishes = new Set();
const EXPIRY = 15 * 60 * 1000;
const mentions = { parse: [] };

function draftKey(interaction) {
  return `${interaction.guildId}:${interaction.user.id}`;
}

function getDraft(interaction) {
  const draft = drafts.get(draftKey(interaction));
  if (!draft || draft.expiresAt < Date.now()) {
    drafts.delete(draftKey(interaction));
    return null;
  }
  return draft;
}

function saveDraft(interaction, draft) {
  draft.expiresAt = Date.now() + EXPIRY;
  drafts.set(draftKey(interaction), draft);
}

function admin(interaction) {
  return interaction.guild && isAdministrator(interaction.memberPermissions);
}

function panelEmbed(panel) {
  return new EmbedBuilder()
    .setColor(config.colors.info)
    .setTitle(panel.title)
    .setDescription(
      `${panel.description}\n\nSelect one or more roles in each category. Your choices are self-service and can be changed later.`
    )
    .setFooter(panel.footer ? { text: panel.footer } : null);
}

function categoryRows(panel, guild) {
  const rows = [];
  for (const category of panel.categories) {
    for (let page = 0; page < Math.ceil(category.roleIds.length / 25); page++) {
      const roleIds = category.roleIds.slice(page * 25, page * 25 + 25);
      rows.push(
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`sr:panel:${category.id}:${page}`)
            .setPlaceholder(
              `${category.name}${category.description ? ` — ${category.description}` : ''}`.slice(
                0,
                150
              )
            )
            .setMinValues(0)
            .setMaxValues(roleIds.length)
            .addOptions(
              roleIds.map((id) => ({
                label: guild.roles.cache.get(id)?.name ?? 'Deleted role',
                value: id,
              }))
            )
        )
      );
    }
  }
  return rows;
}

async function panelPayload(panel, guild) {
  const rows = categoryRows(panel, guild);
  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('sr:mine')
        .setLabel('View my roles')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('sr:remove-all')
        .setLabel('Remove all self-roles')
        .setStyle(ButtonStyle.Danger)
    )
  );
  if (rows.length > 5)
    throw new Error(
      'Discord allows five component rows per message. Reduce categories or roles before publishing.'
    );
  return { embeds: [panelEmbed(panel)], components: rows, allowedMentions: mentions };
}

function controls(prefix = 'setup') {
  if (prefix === 'update')
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('sr:update:add-category')
          .setLabel('Add category')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('sr:update:add-roles')
          .setLabel('Add roles')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('sr:update:remove-roles')
          .setLabel('Remove roles')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('sr:update:rename-category')
          .setLabel('Rename/edit category')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('sr:update:edit-text')
          .setLabel('Edit panel text')
          .setStyle(ButtonStyle.Secondary)
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('sr:update:preview')
          .setLabel('Preview changes')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('sr:update:publish')
          .setLabel('Save and update published panel')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('sr:update:delete')
          .setLabel('Delete panel')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId('sr:update:cancel')
          .setLabel('Cancel changes')
          .setStyle(ButtonStyle.Secondary)
      ),
    ];
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('sr:setup:add-category')
        .setLabel('Add category')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('sr:setup:preview')
        .setLabel('Preview')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('sr:setup:publish')
        .setLabel('Publish panel')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('sr:setup:cancel')
        .setLabel('Cancel setup')
        .setStyle(ButtonStyle.Secondary)
    ),
  ];
}

function setupEmbed(draft) {
  const categories =
    draft.categories
      .map((category) => `${category.name}: ${category.roleIds.length} role(s)`)
      .join('\n') || 'No categories yet.';
  return new EmbedBuilder()
    .setColor(config.colors.info)
    .setTitle('Self-role setup')
    .setDescription(`Categories:\n${categories}`);
}

function textModal(id, title, fields) {
  return new ModalBuilder()
    .setCustomId(id)
    .setTitle(title)
    .addComponents(
      ...fields.map(({ id, label, required, value, maxLength, style = TextInputStyle.Short }) =>
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId(id)
            .setLabel(label)
            .setRequired(required)
            .setValue(value ?? '')
            .setMaxLength(maxLength)
            .setStyle(style)
        )
      )
    );
}

function roleValidation(role, guild) {
  return role.id !== guild.id && isSafeRole(role, guild.members.me?.roles.highest);
}

async function requireManageRoles(interaction) {
  const me = await interaction.guild.members.fetchMe();
  if (!me.permissions.has(PermissionFlagsBits.ManageRoles))
    throw new Error('I need the Manage Roles permission.');
  return me;
}

async function editControls(interaction, draft, prefix = 'setup') {
  await interaction.editReply({
    embeds: [setupEmbed(draft)],
    components: controls(prefix),
    allowedMentions: mentions,
  });
}

export async function startRoleCommand(interaction) {
  if (!admin(interaction))
    return interaction.reply({
      content: 'Administrator permission is required.',
      ephemeral: true,
      allowedMentions: mentions,
    });
  const update = interaction.options.getSubcommand() === 'update';
  const existing = update ? await panelStore.get(interaction.guildId) : null;
  if (update && !existing)
    return interaction.reply({
      content: 'No published self-role panel exists for this server.',
      ephemeral: true,
      allowedMentions: mentions,
    });
  saveDraft(
    interaction,
    structuredClone(
      existing ?? {
        guildId: interaction.guildId,
        title: '',
        description: '',
        footer: '',
        categories: [],
      }
    )
  );
  return interaction.showModal(
    textModal(
      `sr:${update ? 'update' : 'setup'}:text`,
      update ? 'Edit panel text' : 'Create self-role panel',
      [
        { id: 'title', label: 'Title', required: true, value: existing?.title, maxLength: 256 },
        {
          id: 'description',
          label: 'Description',
          required: true,
          value: existing?.description,
          maxLength: 4000,
          style: TextInputStyle.Paragraph,
        },
        {
          id: 'footer',
          label: 'Footer (optional)',
          required: false,
          value: existing?.footer,
          maxLength: 2048,
        },
      ]
    )
  );
}

export async function handleSelfRoleInteraction(interaction) {
  if (!interaction.customId?.startsWith('sr:')) return false;
  if (!tryLock(activeInteractions, interaction.id)) return true;
  try {
    if (interaction.isModalSubmit()) return await handleModal(interaction);
    if (interaction.isRoleSelectMenu()) return await handleRoleSelect(interaction);
    if (interaction.isChannelSelectMenu()) return await handleChannelSelect(interaction);
    if (interaction.isStringSelectMenu()) return await handleStringSelect(interaction);
    if (interaction.isButton()) return await handleButton(interaction);
  } catch (error) {
    if (isStaleInteractionError(error)) return true;
    const payload = {
      content: error.message || 'Self-role operation failed.',
      ephemeral: true,
      allowedMentions: mentions,
    };
    try {
      if (interaction.replied || interaction.deferred) await interaction.followUp(payload);
      else await interaction.reply(payload);
    } catch (replyError) {
      if (!isStaleInteractionError(replyError)) throw replyError;
    }
  } finally {
    activeInteractions.delete(interaction.id);
  }
  return true;
}

async function handleModal(interaction) {
  const [_, action, kind] = interaction.customId.split(':');
  const draft = getDraft(interaction);
  if (!draft || !admin(interaction))
    throw new Error('This administrator setup session has expired.');
  if (kind === 'text') {
    draft.title = interaction.fields.getTextInputValue('title');
    draft.description = interaction.fields.getTextInputValue('description');
    draft.footer = interaction.fields.getTextInputValue('footer');
    saveDraft(interaction, draft);
    return interaction.reply({
      embeds: [setupEmbed(draft)],
      components: controls(action),
      ephemeral: true,
      allowedMentions: mentions,
    });
  }
  if (kind === 'rename') {
    draft.pendingCategory.name = interaction.fields.getTextInputValue('name');
    draft.pendingCategory.description = interaction.fields.getTextInputValue('description');
    draft.pendingCategory = undefined;
    saveDraft(interaction, draft);
    return interaction.reply({
      embeds: [setupEmbed(draft)],
      components: controls('update'),
      ephemeral: true,
      allowedMentions: mentions,
    });
  }
  if (kind === 'category') {
    const category = {
      id: categoryKey(interaction.fields.getTextInputValue('name')),
      name: interaction.fields.getTextInputValue('name'),
      description: interaction.fields.getTextInputValue('description'),
      roleIds: [],
    };
    draft.pendingCategory = category;
    saveDraft(interaction, draft);
    return interaction.reply({
      content: `Choose roles for **${category.name}**. You can add another category later.`,
      components: [
        new ActionRowBuilder().addComponents(
          new RoleSelectMenuBuilder()
            .setCustomId(`sr:${action}:roles`)
            .setPlaceholder('Select safe self-roles')
            .setMinValues(1)
            .setMaxValues(25)
        ),
      ],
      ephemeral: true,
      allowedMentions: mentions,
    });
  }
}

async function handleRoleSelect(interaction) {
  await interaction.deferUpdate();
  const action = interaction.customId.split(':')[1];
  const draft = getDraft(interaction);
  if (!draft || !admin(interaction) || !draft.pendingCategory)
    throw new Error('This administrator setup session has expired.');
  await requireManageRoles(interaction);
  const selected = [...interaction.roles.values()];
  const safe = selected.filter((role) => roleValidation(role, interaction.guild));
  if (!safe.length)
    throw new Error('None of the selected roles are safe and manageable by this bot.');
  draft.pendingCategory.roleIds.push(...safe.map((role) => role.id));
  draft.pendingCategory.roleIds = [...new Set(draft.pendingCategory.roleIds)];
  if (!draft.categories.includes(draft.pendingCategory))
    draft.categories.push(draft.pendingCategory);
  draft.pendingCategory = undefined;
  saveDraft(interaction, draft);
  return editControls(interaction, draft, action);
}

async function handleButton(interaction) {
  const parsed = parseCustomId(interaction.customId);
  if (parsed) return syncCategory(interaction, parsed);
  if (interaction.customId === 'sr:mine') return viewRoles(interaction);
  if (interaction.customId === 'sr:remove-all')
    return interaction.reply({
      content: 'Remove every self-role configured by this panel?',
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('sr:confirm-remove-all')
            .setLabel('Confirm removal')
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId('sr:cancel-remove-all')
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Secondary)
        ),
      ],
      ephemeral: true,
      allowedMentions: mentions,
    });
  if (interaction.customId === 'sr:cancel-remove-all')
    return interaction.update({
      content: 'No roles were changed.',
      components: [],
      allowedMentions: mentions,
    });
  if (interaction.customId === 'sr:confirm-remove-all') return removeAll(interaction);
  if (interaction.customId.startsWith('sr:confirm-category:'))
    return confirmCategoryRemoval(interaction);
  if (interaction.customId === 'sr:confirm-delete') return deletePanel(interaction);
  if (interaction.customId === 'sr:cancel-delete')
    return interaction.update({
      content: 'Deletion cancelled.',
      components: [],
      allowedMentions: mentions,
    });
  const [_, action, operation] = interaction.customId.split(':');
  if (action === 'update' && ['add-roles', 'remove-roles', 'rename-category'].includes(operation))
    return chooseCategory(interaction, operation);
  if (action === 'update' && operation === 'edit-text') return editPanelText(interaction);
  const draft = getDraft(interaction);
  if (!draft || !admin(interaction))
    throw new Error('This administrator setup session has expired.');
  if (operation === 'add-category')
    return interaction.showModal(
      textModal(`sr:${action}:category`, 'Add category', [
        { id: 'name', label: 'Category name', required: true, maxLength: 100 },
        {
          id: 'description',
          label: 'Short description (optional)',
          required: false,
          maxLength: 100,
        },
      ])
    );
  if (operation === 'preview')
    return interaction.reply({
      ...(await panelPayload(draft, interaction.guild)),
      ephemeral: true,
    });
  if (operation === 'cancel') {
    drafts.delete(draftKey(interaction));
    return interaction.update({
      content: 'Changes cancelled.',
      embeds: [],
      components: [],
      allowedMentions: mentions,
    });
  }
  if (operation === 'delete')
    return interaction.reply({
      content: 'Delete the published panel and its configuration?',
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('sr:confirm-delete')
            .setLabel('Confirm deletion')
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId('sr:cancel-delete')
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Secondary)
        ),
      ],
      ephemeral: true,
      allowedMentions: mentions,
    });
  if (interaction.customId === 'sr:confirm-delete') return deletePanel(interaction);
  if (operation === 'publish') {
    if (!validatePanel(draft))
      throw new Error('Add at least one category with a valid role before publishing.');
    if (action === 'update') return saveAndUpdatePublishedPanel(interaction, draft);
    return choosePublishChannel(interaction, action);
  }
}

function choosePublishChannel(interaction, action) {
  return interaction.reply({
    content: 'Choose a text or announcement channel.',
    components: [
      new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId(`sr:${action}:channel`)
          .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
          .setMinValues(1)
          .setMaxValues(1)
      ),
    ],
    ephemeral: true,
    allowedMentions: mentions,
  });
}

async function saveAndUpdatePublishedPanel(interaction, draft) {
  const previous = await panelStore.get(interaction.guildId);
  const oldChannel = await interaction.guild.channels.fetch(previous?.channelId).catch(() => null);
  const oldMessage = await oldChannel?.messages.fetch(previous?.messageId).catch(() => null);
  if (!oldMessage) {
    return choosePublishChannel(interaction, 'update');
  }
  await oldMessage.edit(await panelPayload(draft, interaction.guild));
  draft.channelId = oldChannel.id;
  draft.messageId = oldMessage.id;
  await panelStore.save(draft);
  drafts.delete(draftKey(interaction));
  return interaction.update({
    content: 'Published panel updated.',
    components: [],
    allowedMentions: mentions,
  });
}

async function handleChannelSelect(interaction) {
  await interaction.deferUpdate();
  const draft = getDraft(interaction);
  if (!draft || !admin(interaction))
    throw new Error('This administrator setup session has expired.');
  const publishKey = draftKey(interaction);
  if (!tryLock(activePublishes, publishKey)) return;
  try {
    const existing = await panelStore.get(interaction.guildId);
    if (existing?.messageId) {
      const channel = await interaction.guild.channels.fetch(existing.channelId).catch(() => null);
      const message = await channel?.messages.fetch(existing.messageId).catch(() => null);
      if (message) {
        await interaction.editReply({
          content:
            'A self-role panel is already published for this server. Use `/role update` to change it.',
          components: [],
          allowedMentions: mentions,
        });
        return;
      }
    }
    const channel = interaction.channels.first();
    if (!channel?.isTextBased()) throw new Error('Choose a guild text or announcement channel.');
    const message = await channel.send(await panelPayload(draft, interaction.guild));
    draft.channelId = channel.id;
    draft.messageId = message.id;
    await panelStore.save(draft);
    drafts.delete(publishKey);
    return interaction.editReply({
      content: 'Self-role panel published.',
      components: [],
      allowedMentions: mentions,
    });
  } finally {
    activePublishes.delete(publishKey);
  }
}

async function handleStringSelect(interaction) {
  const parsed = parseCustomId(interaction.customId);
  if (parsed) return syncCategory(interaction, parsed);
  const [, action, operation] = interaction.customId.split(':');
  if (action === 'update' && operation === 'category') return handleCategoryChoice(interaction);
  if (action === 'update' && operation === 'remove-roles')
    return removeRolesFromCategory(interaction);
  throw new Error('Unknown self-role menu.');
}

async function chooseCategory(interaction, operation) {
  const draft = getDraft(interaction);
  if (!draft || !admin(interaction))
    throw new Error('This administrator setup session has expired.');
  return interaction.reply({
    content: 'Choose a category.',
    components: [
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`sr:update:category:${operation}`)
          .setPlaceholder('Choose category')
          .addOptions(
            draft.categories.map((category) => ({ label: category.name, value: category.id }))
          )
      ),
    ],
    ephemeral: true,
    allowedMentions: mentions,
  });
}

async function handleCategoryChoice(interaction) {
  const [, , , operation] = interaction.customId.split(':');
  const draft = getDraft(interaction);
  const category = draft?.categories.find((item) => item.id === interaction.values[0]);
  if (!category || !admin(interaction))
    throw new Error('This administrator setup session has expired.');
  draft.pendingCategory = category;
  saveDraft(interaction, draft);
  if (operation === 'add-roles')
    return interaction.update({
      content: `Choose additional roles for **${category.name}**.`,
      components: [
        new ActionRowBuilder().addComponents(
          new RoleSelectMenuBuilder()
            .setCustomId('sr:update:roles')
            .setMinValues(1)
            .setMaxValues(25)
        ),
      ],
      allowedMentions: mentions,
    });
  if (operation === 'remove-roles')
    return interaction.update({
      content: `Choose roles to remove from **${category.name}**.`,
      components: [
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('sr:update:remove-roles')
            .setMinValues(1)
            .setMaxValues(category.roleIds.length)
            .addOptions(
              category.roleIds.map((id) => ({
                label: interaction.guild.roles.cache.get(id)?.name ?? 'Deleted role',
                value: id,
              }))
            )
        ),
      ],
      allowedMentions: mentions,
    });
  return interaction.showModal(
    textModal('sr:update:rename', 'Rename/edit category', [
      { id: 'name', label: 'Category name', required: true, value: category.name, maxLength: 100 },
      {
        id: 'description',
        label: 'Short description',
        required: false,
        value: category.description,
        maxLength: 100,
      },
    ])
  );
}

async function removeRolesFromCategory(interaction) {
  const draft = getDraft(interaction);
  const category = draft?.pendingCategory;
  if (!category || !admin(interaction))
    throw new Error('This administrator setup session has expired.');
  category.roleIds = category.roleIds.filter((id) => !interaction.values.includes(id));
  draft.pendingCategory = undefined;
  saveDraft(interaction, draft);
  return editControls(interaction, draft, 'update');
}

async function editPanelText(interaction) {
  const draft = getDraft(interaction);
  if (!draft || !admin(interaction))
    throw new Error('This administrator setup session has expired.');
  return interaction.showModal(
    textModal('sr:update:text', 'Edit panel text', [
      { id: 'title', label: 'Title', required: true, value: draft.title, maxLength: 256 },
      {
        id: 'description',
        label: 'Description',
        required: true,
        value: draft.description,
        maxLength: 4000,
        style: TextInputStyle.Paragraph,
      },
      {
        id: 'footer',
        label: 'Footer (optional)',
        required: false,
        value: draft.footer,
        maxLength: 2048,
      },
    ])
  );
}

async function syncCategory(interaction, parsed) {
  const panel = await panelStore.get(interaction.guildId);
  const category = panel?.categories.find((item) => item.id === parsed.categoryId);
  if (!category || !category.roleIds.length)
    throw new Error('This role category no longer exists.');
  await requireManageRoles(interaction);
  const member = await interaction.guild.members.fetch(interaction.user.id);
  const selected = interaction.values ?? [];
  const sync = calculateCategorySync(
    category.roleIds.slice(parsed.page * 25, parsed.page * 25 + 25),
    [...member.roles.cache.keys()],
    selected
  );
  if (!selected.length)
    return interaction.reply({
      content: `Remove all selected roles from **${category.name}**?`,
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`sr:confirm-category:${category.id}:${parsed.page}`)
            .setLabel('Confirm removal')
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId('sr:cancel-remove-all')
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Secondary)
        ),
      ],
      ephemeral: true,
      allowedMentions: mentions,
    });
  const result = await applySync(member, sync, interaction.guild);
  return interaction.reply({ content: result, ephemeral: true, allowedMentions: mentions });
}

async function confirmCategoryRemoval(interaction) {
  const [, , categoryId, page] = interaction.customId.split(':');
  const panel = await panelStore.get(interaction.guildId);
  const category = panel?.categories.find((item) => item.id === categoryId);
  if (!category) throw new Error('This role category no longer exists.');
  await requireManageRoles(interaction);
  const member = await interaction.guild.members.fetch(interaction.user.id);
  const roleIds = category.roleIds.slice(Number(page) * 25, Number(page) * 25 + 25);
  const held = [...member.roles.cache.keys()].filter((id) => roleIds.includes(id));
  const result = await applySync(
    member,
    { add: [], remove: held, unchanged: [] },
    interaction.guild
  );
  return interaction.update({ content: result, components: [], allowedMentions: mentions });
}

async function applySync(member, sync, guild) {
  const failed = [];
  for (const id of sync.add)
    try {
      await member.roles.add(id);
    } catch {
      failed.push(id);
    }
  for (const id of sync.remove)
    try {
      await member.roles.remove(id);
    } catch {
      failed.push(id);
    }
  const names = (ids) =>
    ids.map((id) => guild.roles.cache.get(id)?.name ?? 'deleted role').join(', ') || 'none';
  return `Added: ${names(sync.add)}\nRemoved: ${names(sync.remove)}\nUnchanged: ${names(sync.unchanged)}${failed.length ? `\nFailed: ${names(failed)}` : ''}`;
}

async function viewRoles(interaction) {
  const panel = await panelStore.get(interaction.guildId);
  const member = await interaction.guild.members.fetch(interaction.user.id);
  const ids = new Set(panel?.categories.flatMap((category) => category.roleIds));
  const names = [...member.roles.cache.values()]
    .filter((role) => ids.has(role.id))
    .map((role) => role.name);
  return interaction.reply({
    content: names.length
      ? `Your self-roles: ${names.join(', ')}`
      : 'You do not currently have any self-roles from this panel.',
    ephemeral: true,
    allowedMentions: mentions,
  });
}

async function removeAll(interaction) {
  const panel = await panelStore.get(interaction.guildId);
  await requireManageRoles(interaction);
  const member = await interaction.guild.members.fetch(interaction.user.id);
  const ids = new Set(panel?.categories.flatMap((category) => category.roleIds));
  const held = [...member.roles.cache.keys()].filter((id) => ids.has(id));
  const result = await applySync(
    member,
    { add: [], remove: held, unchanged: [] },
    interaction.guild
  );
  return interaction.update({ content: result, components: [], allowedMentions: mentions });
}

async function deletePanel(interaction) {
  const panel = await panelStore.get(interaction.guildId);
  const channel = await interaction.guild.channels.fetch(panel?.channelId).catch(() => null);
  await channel?.messages.delete(panel.messageId).catch(() => null);
  await panelStore.delete(interaction.guildId);
  drafts.delete(draftKey(interaction));
  return interaction.update({
    content: 'Self-role panel and configuration deleted.',
    components: [],
    allowedMentions: mentions,
  });
}
