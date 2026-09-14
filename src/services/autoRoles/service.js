import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  RoleSelectMenuBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { config as botConfig } from '#config/config';
import { ICONS, ICON_IDS } from '#config/emojis';
import {
  DM_DESCRIPTION,
  DM_LABEL,
  FEATURES,
  FEATURE_META,
  LIMITS,
  RESET_TARGETS,
  clampInt,
  describeReset,
  formatDays,
  formatInvites,
  formatMessages,
  formatRoles,
  isAdministrator,
  isSafeAutoRole,
  loadAutoRoleConfig,
  resetFeatures,
  saveAutoRoleConfig,
} from '#services/autoRoles/logic';

const mentions = { parse: [] };
const locked = new Set();
const PREFIX = 'ar:';
const RESET_KEYS = ['join', 'timed', 'invite', 'activity', 'dmNotification'];

function admin(interaction) {
  return interaction.guild && isAdministrator(interaction.memberPermissions);
}

function isStale(error) {
  return error?.code === 10062 || error?.code === 40060;
}

async function loadConfig(guildId) {
  return loadAutoRoleConfig(guildId);
}

async function saveConfig(config) {
  return saveAutoRoleConfig(config);
}

function featureStatus(config, feature) {
  const state = config[feature];
  const roles = state.roleIds.length;

  if (!state.enabled) return `${ICONS.failed} Off`;
  if (!roles) return `${ICONS.warning} On — but no roles picked yet`;

  switch (feature) {
    case 'join':
      return `${ICONS.success} On — gives ${formatRoles(roles)} to new members`;
    case 'timed':
      return `${ICONS.success} On — gives ${formatRoles(roles)} after ${formatDays(state.days)}`;
    case 'invite':
      return `${ICONS.success} On — gives ${formatRoles(roles)} at ${formatInvites(state.count)}`;
    case 'activity':
      return `${ICONS.success} On — gives ${formatRoles(roles)} at ${formatMessages(state.messages)} in ${formatDays(state.days)}`;
    default:
      return `${ICONS.success} On`;
  }
}

const FEATURE_ICONS = {
  join: ICONS[FEATURE_META.join.icon],
  timed: ICONS[FEATURE_META.timed.icon],
  invite: ICONS[FEATURE_META.invite.icon],
  activity: ICONS[FEATURE_META.activity.icon],
};

function menuEmbed(config) {
  const blocks = [FEATURE_META.join, FEATURE_META.timed, FEATURE_META.invite, FEATURE_META.activity]
    .map((meta, index) =>
      [
        `${FEATURE_ICONS[FEATURES[index]]} **${index + 1}. ${meta.label}**`,
        meta.description,
        featureStatus(config, FEATURES[index]),
      ].join('\n')
    )
    .join('\n\n');

  const dmBlock = [
    `${ICONS.mail} **5. ${DM_LABEL}**`,
    DM_DESCRIPTION,
    config.dmNotification ? `${ICONS.success} On — members are notified` : `${ICONS.failed} Off`,
  ].join('\n');

  return new EmbedBuilder()
    .setColor(botConfig.colors.info)
    .setTitle(`${ICONS.edit} Auto Roles`)
    .setDescription(
      [
        'Hand out roles automatically — no manual work needed.',
        'Pick a rule below to set it up or change it.',
        '',
        blocks,
        '',
        dmBlock,
      ].join('\n')
    )
    .setFooter({ text: 'Administrators only.' });
}

function menuRows(config) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${PREFIX}open:join`)
        .setLabel('1. Welcome')
        .setEmoji(ICON_IDS.link)
        .setStyle(config.join.enabled ? ButtonStyle.Success : ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`${PREFIX}open:timed`)
        .setLabel('2. Tenure')
        .setEmoji(ICON_IDS.loading)
        .setStyle(config.timed.enabled ? ButtonStyle.Success : ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`${PREFIX}open:invite`)
        .setLabel('3. Invites')
        .setEmoji(ICON_IDS.mail)
        .setStyle(config.invite.enabled ? ButtonStyle.Success : ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`${PREFIX}open:activity`)
        .setLabel('4. Activity')
        .setEmoji(ICON_IDS.code)
        .setStyle(config.activity.enabled ? ButtonStyle.Success : ButtonStyle.Primary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${PREFIX}dm`)
        .setLabel(`5. DM Notice: ${config.dmNotification ? 'On' : 'Off'}`)
        .setEmoji(config.dmNotification ? ICON_IDS.success : ICON_IDS.failed)
        .setStyle(config.dmNotification ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`${PREFIX}reset`)
        .setLabel('Reset')
        .setEmoji(ICON_IDS.delete)
        .setStyle(ButtonStyle.Danger)
    ),
  ];
}

function featureEmbed(config, feature) {
  const state = config[feature];
  const meta = FEATURE_META[feature];

  const lines = [
    meta.description,
    '',
    `**Status:** ${state.enabled ? `${ICONS.success} On` : `${ICONS.failed} Off`}`,
  ];

  if (feature === 'timed') {
    lines.push(`**Waiting time:** ${formatDays(state.days)}`);
  }
  if (feature === 'invite') {
    lines.push(`**Invites needed:** ${formatInvites(state.count)}`);
  }
  if (feature === 'activity') {
    lines.push(`**Messages needed:** ${formatMessages(state.messages)}`);
    lines.push(`**Counted within:** ${formatDays(state.days)}`);
  }

  lines.push('', `**Roles to give (${state.roleIds.length})**`);
  if (state.roleIds.length) {
    for (const id of state.roleIds) {
      lines.push(`${ICONS.check} ${roleLabel(config, id)}`);
    }
  } else {
    lines.push(`${ICONS.warning} None yet — use **Pick roles** below.`);
  }

  return new EmbedBuilder()
    .setColor(botConfig.colors.info)
    .setTitle(`${FEATURE_ICONS[feature]} ${meta.label}`)
    .setDescription(lines.join('\n'));
}

function roleLabel(config, id) {
  return config.__roleNames?.[id] ?? `<@&${id}>`;
}

function featureRows(config, feature) {
  const on = config[feature].enabled;

  const rows = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${PREFIX}toggle:${feature}`)
        .setLabel(on ? 'Turn off' : 'Turn on')
        .setEmoji(on ? ICON_IDS.failed : ICON_IDS.success)
        .setStyle(on ? ButtonStyle.Danger : ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`${PREFIX}roles:${feature}`)
        .setLabel('Pick roles')
        .setEmoji(ICON_IDS.search)
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`${PREFIX}clear:${feature}`)
        .setLabel('Clear roles')
        .setEmoji(ICON_IDS.delete)
        .setStyle(ButtonStyle.Secondary)
    ),
  ];

  if (feature === 'timed') {
    rows[0].addComponents(
      new ButtonBuilder()
        .setCustomId(`${PREFIX}threshold:timed`)
        .setLabel('Set days')
        .setEmoji(ICON_IDS.edit)
        .setStyle(ButtonStyle.Secondary)
    );
  }
  if (feature === 'invite') {
    rows[0].addComponents(
      new ButtonBuilder()
        .setCustomId(`${PREFIX}threshold:invite`)
        .setLabel('Set invites')
        .setEmoji(ICON_IDS.edit)
        .setStyle(ButtonStyle.Secondary)
    );
  }
  if (feature === 'activity') {
    rows[0].addComponents(
      new ButtonBuilder()
        .setCustomId(`${PREFIX}threshold:activity`)
        .setLabel('Set limits')
        .setEmoji(ICON_IDS.edit)
        .setStyle(ButtonStyle.Secondary)
    );
  }

  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${PREFIX}back`)
        .setLabel('Back')
        .setStyle(ButtonStyle.Secondary)
    )
  );

  return rows;
}

export function renderMenu(config) {
  return { embeds: [menuEmbed(config)], components: menuRows(config) };
}

async function showMenu(interaction, edit = false) {
  const config = await loadConfig(interaction.guildId);
  const payload = { ...renderMenu(config), allowedMentions: mentions };
  if (edit) return interaction.update(payload);
  return interaction.reply({ ...payload, ephemeral: true });
}

export function renderResetPicker(config) {
  const active = RESET_KEYS.filter((key) =>
    key === 'dmNotification'
      ? !config.dmNotification
      : config[key]?.enabled || config[key]?.roleIds?.length
  );

  return {
    embeds: [
      new EmbedBuilder()
        .setColor(botConfig.colors.error)
        .setTitle(`${ICONS.delete} Reset Settings`)
        .setDescription(
          [
            'Choose what you want to put back to its default.',
            'Anything you leave unselected stays exactly as it is.',
            '',
            ...describeReset(config, RESET_KEYS),
            '',
            active.length
              ? `${ICONS.warning} Currently set up: **${active.map((key) => RESET_TARGETS[key]).join(', ')}**`
              : `${ICONS.info} Nothing is set up yet.`,
          ].join('\n')
        )
        .setFooter({ text: 'You will be asked to confirm first.' }),
    ],
    components: [
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`${PREFIX}resetpick`)
          .setPlaceholder('Pick what to reset')
          .setMinValues(1)
          .setMaxValues(RESET_KEYS.length)
          .addOptions(
            RESET_KEYS.map((key) => ({
              label: RESET_TARGETS[key],
              value: key,
              description: config[key]?.roleIds?.length
                ? `${formatRoles(config[key].roleIds.length)} set up`
                : 'Nothing set up',
            }))
          )
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`${PREFIX}back`)
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Secondary)
      ),
    ],
  };
}

async function showResetPicker(interaction, edit = false) {
  const config = await loadConfig(interaction.guildId);
  const payload = { ...renderResetPicker(config), allowedMentions: mentions };

  if (edit) return interaction.update(payload);
  return interaction.reply({ ...payload, ephemeral: true });
}

export function renderResetConfirm(config, keys) {
  return {
    embeds: [
      new EmbedBuilder()
        .setColor(botConfig.colors.error)
        .setTitle(`${ICONS.warning} Are You Sure?`)
        .setDescription(
          [
            'These will go back to their defaults:',
            '',
            ...describeReset(config, keys),
            '',
            `${ICONS.failed} **This cannot be undone.**`,
          ].join('\n')
        ),
    ],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`${PREFIX}resetok:${keys.join('|')}`)
          .setLabel('Yes, reset')
          .setEmoji(ICON_IDS.delete)
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`${PREFIX}resetcancel`)
          .setLabel('No, keep it')
          .setEmoji(ICON_IDS.failed)
          .setStyle(ButtonStyle.Secondary)
      ),
    ],
  };
}

async function showResetConfirm(interaction, keys) {
  const config = await loadConfig(interaction.guildId);
  return interaction.update({
    ...renderResetConfirm(config, keys),
    allowedMentions: mentions,
  });
}

export function renderFeature(config, feature) {
  return { embeds: [featureEmbed(config, feature)], components: featureRows(config, feature) };
}

async function showFeature(interaction, feature, edit = false) {
  const config = await loadConfig(interaction.guildId);
  await decorateRoleNames(config, interaction.guild);
  const payload = { ...renderFeature(config, feature), allowedMentions: mentions };
  if (edit) return interaction.update(payload);
  return interaction.reply({ ...payload, ephemeral: true });
}

async function decorateRoleNames(config, guild) {
  config.__roleNames = {};
  for (const id of new Set(Object.values(config).flatMap((v) => v?.roleIds ?? []))) {
    const role = guild.roles.cache.get(id);
    config.__roleNames[id] = role ? role.name : 'deleted role';
  }
}

function thresholdModal(feature, config) {
  if (feature === 'invite') {
    return new ModalBuilder()
      .setCustomId(`${PREFIX}threshold:invite`)
      .setTitle('Invites needed')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('value')
            .setLabel(`How many invites (${LIMITS.inviteCount.min}-${LIMITS.inviteCount.max})`)
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setValue(String(config.invite.count))
        )
      );
  }
  if (feature === 'activity') {
    return new ModalBuilder()
      .setCustomId(`${PREFIX}threshold:activity`)
      .setTitle('Activity limits')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('messages')
            .setLabel(
              `Messages needed (${LIMITS.activityMessages.min}-${LIMITS.activityMessages.max})`
            )
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setValue(String(config.activity.messages))
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('days')
            .setLabel(
              `Counted over how many days (${LIMITS.activityDays.min}-${LIMITS.activityDays.max})`
            )
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setValue(String(config.activity.days))
        )
      );
  }
  return new ModalBuilder()
    .setCustomId(`${PREFIX}threshold:timed`)
    .setTitle('Days to wait')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('value')
          .setLabel(`Days in the server (${LIMITS.timedDays.min}-${LIMITS.timedDays.max})`)
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setValue(String(config.timed.days))
      )
    );
}

export async function startAutoRoleCommand(interaction) {
  if (!admin(interaction)) {
    return interaction.reply({
      content: `${ICONS.lock} Only administrators can change auto roles.`,
      ephemeral: true,
      allowedMentions: mentions,
    });
  }
  return showMenu(interaction);
}

export async function handleAutoRoleInteraction(interaction) {
  if (!interaction.customId?.startsWith(PREFIX)) return false;
  if (locked.has(interaction.id)) return true;
  locked.add(interaction.id);

  try {
    if (!admin(interaction)) {
      const payload = {
        content: `${ICONS.lock} Only administrators can change auto roles.`,
        ephemeral: true,
        allowedMentions: mentions,
      };
      if (interaction.replied || interaction.deferred) await interaction.followUp(payload);
      else await interaction.reply(payload);
      return true;
    }

    if (interaction.isModalSubmit()) return await handleModal(interaction);
    if (interaction.isStringSelectMenu()) return await handleStringSelect(interaction);
    if (interaction.isRoleSelectMenu()) return await handleRoleSelect(interaction);
    if (interaction.isButton()) return await handleButton(interaction);
  } catch (error) {
    if (isStale(error)) return true;
    const payload = {
      content: `${ICONS.failed} ${error.message || 'That action did not work.'}`,
      ephemeral: true,
      allowedMentions: mentions,
    };
    try {
      if (interaction.replied || interaction.deferred) await interaction.followUp(payload);
      else await interaction.reply(payload);
    } catch (replyError) {
      if (!isStale(replyError)) throw replyError;
    }
  } finally {
    locked.delete(interaction.id);
  }
  return true;
}

async function handleButton(interaction) {
  const [, action, payload] = interaction.customId.split(':');

  if (action === 'back') return showMenu(interaction, true);

  if (action === 'reset') return showResetPicker(interaction, true);

  if (action === 'resetcancel') return showMenu(interaction, true);

  if (action === 'resetok') {
    const keys = (payload ?? '').split('|').filter((key) => RESET_KEYS.includes(key));
    if (!keys.length) throw new Error('No valid settings were selected to reset.');

    const config = await loadConfig(interaction.guildId);
    await saveConfig(resetFeatures(config, keys));

    return interaction.update({
      embeds: [
        new EmbedBuilder()
          .setColor(botConfig.colors.success)
          .setTitle(`${ICONS.success} Reset Complete`)
          .setDescription(
            [
              'Back to defaults:',
              '',
              ...keys.map((key) => `${ICONS.delete} ${RESET_TARGETS[key]}`),
            ].join('\n')
          ),
      ],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`${PREFIX}back`)
            .setLabel('Back')
            .setStyle(ButtonStyle.Secondary)
        ),
      ],
      allowedMentions: mentions,
    });
  }

  if (action === 'dm') {
    const config = await loadConfig(interaction.guildId);
    config.dmNotification = !config.dmNotification;
    await saveConfig(config);
    return showMenu(interaction, true);
  }

  if (action === 'open') return showFeature(interaction, payload, true);

  if (action === 'toggle') {
    const config = await loadConfig(interaction.guildId);
    config[payload].enabled = !config[payload].enabled;
    await saveConfig(config);
    return showFeature(interaction, payload, true);
  }

  if (action === 'clear') {
    const config = await loadConfig(interaction.guildId);
    config[payload].roleIds = [];
    await saveConfig(config);
    return showFeature(interaction, payload, true);
  }

  if (action === 'roles') {
    const config = await loadConfig(interaction.guildId);
    await decorateRoleNames(config, interaction.guild);
    return interaction.update({
      embeds: [featureEmbed(config, payload)],
      components: [
        new ActionRowBuilder().addComponents(
          new RoleSelectMenuBuilder()
            .setCustomId(`${PREFIX}saveroles:${payload}`)
            .setPlaceholder('Pick the roles to give')
            .setMinValues(1)
            .setMaxValues(25)
        ),
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`${PREFIX}open:${payload}`)
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Secondary)
        ),
      ],
      allowedMentions: mentions,
    });
  }

  if (action === 'threshold') {
    const config = await loadConfig(interaction.guildId);
    return interaction.showModal(thresholdModal(payload, config));
  }

  throw new Error('Unknown auto-role action.');
}

async function handleStringSelect(interaction) {
  const [, action] = interaction.customId.split(':');
  if (action !== 'resetpick') throw new Error('Unknown auto-role menu.');

  const keys = interaction.values.filter((key) => RESET_KEYS.includes(key));
  if (!keys.length) throw new Error('No valid settings were selected.');

  return showResetConfirm(interaction, keys);
}

async function handleRoleSelect(interaction) {
  const [, action, feature] = interaction.customId.split(':');
  if (action !== 'saveroles') throw new Error('Unknown auto-role menu.');

  const config = await loadConfig(interaction.guildId);
  const me = interaction.guild.members.me ?? (await interaction.guild.members.fetchMe());

  const safe = [...interaction.roles.values()].filter((role) =>
    isSafeAutoRole(role, me.roles.highest)
  );
  const rejected = [...interaction.roles.values()].filter(
    (role) => !isSafeAutoRole(role, me.roles.highest)
  );

  if (!safe.length)
    throw new Error('None of the selected roles are safe and manageable by this bot.');

  config[feature].roleIds = safe.map((role) => role.id);
  await saveConfig(config);
  await decorateRoleNames(config, interaction.guild);

  const note = rejected.length
    ? `${ICONS.warning} Skipped ${formatRoles(rejected.length)} the bot cannot manage: ${rejected.map((role) => role.name).join(', ')}`
    : '';

  return interaction.update({
    embeds: [
      new EmbedBuilder()
        .setColor(botConfig.colors.info)
        .setTitle(`${FEATURE_ICONS[feature]} ${FEATURE_META[feature].label}`)
        .setDescription(
          [
            `${ICONS.success} Saved ${formatRoles(safe.length)}.`,
            '',
            ...safe.map((role) => `${ICONS.check} ${role.name}`),
            note,
          ].join('\n')
        ),
    ],
    components: featureRows(config, feature),
    allowedMentions: mentions,
  });
}

async function handleModal(interaction) {
  const [, action, feature] = interaction.customId.split(':');
  if (action !== 'threshold') throw new Error('Unknown auto-role modal.');

  const config = await loadConfig(interaction.guildId);

  if (feature === 'invite') {
    config.invite.count = clampInt(
      interaction.fields.getTextInputValue('value'),
      LIMITS.inviteCount,
      config.invite.count
    );
  } else if (feature === 'activity') {
    config.activity.messages = clampInt(
      interaction.fields.getTextInputValue('messages'),
      LIMITS.activityMessages,
      config.activity.messages
    );
    config.activity.days = clampInt(
      interaction.fields.getTextInputValue('days'),
      LIMITS.activityDays,
      config.activity.days
    );
  } else {
    config.timed.days = clampInt(
      interaction.fields.getTextInputValue('value'),
      LIMITS.timedDays,
      config.timed.days
    );
  }

  await saveConfig(config);
  await decorateRoleNames(config, interaction.guild);

  return interaction.reply({
    embeds: [featureEmbed(config, feature)],
    components: featureRows(config, feature),
    ephemeral: true,
    allowedMentions: mentions,
  });
}
