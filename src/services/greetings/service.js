import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  EmbedBuilder,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { config as botConfig } from '#config/config';
import { ICONS, ICON_IDS } from '#config/emojis';
import { isAdministrator } from '#services/autoRoles/logic';
import {
  KINDS,
  KIND_META,
  PLACEHOLDERS,
  enabledKinds,
  greetingSummary,
  previewText,
} from '#services/greetings/logic';
import { greetingStore } from '#services/store';
import { logger } from '#utils/logger';

const PREFIX = 'gr:';
const mentions = { parse: [] };
const locked = new Set();

function admin(interaction) {
  return interaction.guild && isAdministrator(interaction.memberPermissions);
}

function isStale(error) {
  return error?.code === 10062 || error?.code === 40060;
}

async function loadConfig(guildId) {
  return greetingStore.get(guildId);
}

export function renderMenu(config) {
  const blocks = KINDS.map((kind, index) => {
    const meta = KIND_META[kind];
    return [
      `${ICONS[meta.icon]} **${index + 1}. ${meta.label}**`,
      meta.description,
      greetingSummary(config, kind),
    ].join('\n');
  }).join('\n\n');

  const on = enabledKinds(config);

  return {
    embeds: [
      new EmbedBuilder()
        .setColor(botConfig.colors.info)
        .setTitle(`${ICONS.mail} Greetings`)
        .setDescription(
          [
            'Greet people automatically when they come and go.',
            'Pick one below to set it up or change it.',
            '',
            blocks,
            '',
            on.length
              ? `${ICONS.info} ${on.length} of 4 active.`
              : `${ICONS.info} Nothing is active yet.`,
          ].join('\n')
        )
        .setFooter({ text: 'Administrators only.' }),
    ],
    components: [
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`${PREFIX}open`)
          .setPlaceholder('Pick a greeting to set up')
          .addOptions(
            KINDS.map((kind, index) => ({
              label: `${index + 1}. ${KIND_META[kind].label}`,
              value: kind,
              description: config[kind].enabled
                ? greetingSummary(config, kind).slice(0, 100)
                : 'Currently off',
            }))
          )
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`${PREFIX}reset`)
          .setLabel('Reset')
          .setEmoji(ICON_IDS.delete)
          .setStyle(ButtonStyle.Danger)
      ),
    ],
  };
}

export function renderKind(config, kind) {
  const state = config[kind];
  const meta = KIND_META[kind];

  const lines = [
    meta.description,
    '',
    `**Status:** ${state.enabled ? `${ICONS.success} On` : `${ICONS.failed} Off`}`,
  ];

  if (meta.channel) {
    lines.push(
      `**Channel:** ${state.channelId ? `<#${state.channelId}>` : `${ICONS.warning} not picked yet`}`
    );
  }
  lines.push(
    `**Style:** ${state.style === 'text' ? 'Plain message' : 'Embed'}`,
    '',
    '**Message**',
    previewText(state, kind)
  );

  return {
    embeds: [
      new EmbedBuilder()
        .setColor(state.style === 'embed' ? state.color : botConfig.colors.info)
        .setTitle(`${ICONS[meta.icon]} ${meta.label}`)
        .setDescription(lines.join('\n')),
    ],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`${PREFIX}toggle:${kind}`)
          .setLabel(state.enabled ? 'Turn off' : 'Turn on')
          .setEmoji(state.enabled ? ICON_IDS.failed : ICON_IDS.success)
          .setStyle(state.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`${PREFIX}edit:${kind}`)
          .setLabel('Edit message')
          .setEmoji(ICON_IDS.edit)
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`${PREFIX}style:${kind}`)
          .setLabel(state.style === 'text' ? 'Use embed' : 'Use plain text')
          .setEmoji(ICON_IDS.refresh)
          .setStyle(ButtonStyle.Secondary)
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`${PREFIX}channel:${kind}`)
          .setLabel('Pick channel')
          .setEmoji(ICON_IDS.link)
          .setStyle(ButtonStyle.Primary)
          .setDisabled(!meta.channel),
        new ButtonBuilder()
          .setCustomId(`${PREFIX}placeholders:${kind}`)
          .setLabel('Variables')
          .setEmoji(ICON_IDS.info)
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`${PREFIX}back`)
          .setLabel('Back')
          .setStyle(ButtonStyle.Secondary)
      ),
    ],
  };
}

export function renderPlaceholders(kind) {
  return {
    embeds: [
      new EmbedBuilder()
        .setColor(botConfig.colors.info)
        .setTitle(`${ICONS.info} Variables for ${KIND_META[kind].label}`)
        .setDescription(
          [
            'Type these into your message and they are swapped out automatically.',
            '',
            ...PLACEHOLDERS.map((entry) => `${ICONS.check} \`${entry.token}\` — ${entry.about}`),
            kind === 'welcome' || kind === 'dm'
              ? `${ICONS.check} \`{avatar}\` — The member avatar (embed style only)`
              : '',
          ]
            .filter(Boolean)
            .join('\n')
        ),
    ],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`${PREFIX}openkind:${kind}`)
          .setLabel('Back')
          .setStyle(ButtonStyle.Secondary)
      ),
    ],
  };
}

export function renderChannelPicker(config, kind) {
  return {
    embeds: [
      new EmbedBuilder()
        .setColor(botConfig.colors.info)
        .setTitle(`${ICONS.link} Channel for ${KIND_META[kind].label}`)
        .setDescription(
          [
            'Where this greeting gets posted.',
            '',
            config[kind].channelId
              ? `${ICONS.check} Currently: <#${config[kind].channelId}>`
              : `${ICONS.warning} Nothing picked yet.`,
          ].join('\n')
        ),
    ],
    components: [
      new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId(`${PREFIX}savechannel:${kind}`)
          .setPlaceholder('Pick the channel')
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`${PREFIX}openkind:${kind}`)
          .setLabel('Back')
          .setStyle(ButtonStyle.Secondary)
      ),
    ],
  };
}

export function renderResetConfirm(config) {
  const on = enabledKinds(config);
  return {
    embeds: [
      new EmbedBuilder()
        .setColor(botConfig.colors.error)
        .setTitle(`${ICONS.warning} Reset Greetings?`)
        .setDescription(
          [
            'Every greeting goes back to its default text and turns off.',
            '',
            on.length
              ? `Will be turned off: **${on.map((kind) => KIND_META[kind].label).join(', ')}**`
              : 'Nothing is active right now.',
            '',
            `${ICONS.failed} **This cannot be undone.**`,
          ].join('\n')
        ),
    ],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`${PREFIX}resetok`)
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

export function editModal(kind, config) {
  const state = config[kind];
  const modal = new ModalBuilder().setCustomId(`${PREFIX}edit:${kind}`);

  if (state.style === 'text') {
    return modal
      .setTitle('Edit message')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('text')
            .setLabel('Message')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(1800)
            .setValue(state.text)
        )
      );
  }

  return modal
    .setTitle('Edit embed')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('title')
          .setLabel('Embed title')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(256)
          .setValue(state.embedTitle)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('text')
          .setLabel('Embed description')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(1800)
          .setValue(state.text)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('color')
          .setLabel('Color hex, e.g. ffdde8')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setValue(state.color.toString(16).padStart(6, '0'))
      )
    );
}

function show(interaction, payload, edit) {
  if (edit) return interaction.update({ ...payload, allowedMentions: mentions });
  return interaction.reply({ ...payload, ephemeral: true, allowedMentions: mentions });
}

async function showMenu(interaction, edit = true) {
  const config = await loadConfig(interaction.guildId);
  return show(interaction, renderMenu(config), edit);
}

async function showKind(interaction, kind, edit = true) {
  const config = await loadConfig(interaction.guildId);
  return show(interaction, renderKind(config, kind), edit);
}

export async function startGreetingCommand(interaction) {
  if (!admin(interaction)) {
    return interaction.reply({
      content: `${ICONS.lock} Only administrators can change greetings.`,
      ephemeral: true,
      allowedMentions: mentions,
    });
  }
  return showMenu(interaction, false);
}

export async function handleGreetingInteraction(interaction) {
  if (!interaction.customId?.startsWith(PREFIX)) return false;
  if (locked.has(interaction.id)) return true;
  locked.add(interaction.id);

  try {
    if (!admin(interaction)) {
      const payload = {
        content: `${ICONS.lock} Only administrators can change greetings.`,
        ephemeral: true,
        allowedMentions: mentions,
      };
      if (interaction.replied || interaction.deferred) await interaction.followUp(payload);
      else await interaction.reply(payload);
      return true;
    }

    if (interaction.isModalSubmit()) return await handleModal(interaction);
    if (interaction.isStringSelectMenu()) return await handleSelect(interaction);
    if (interaction.isChannelSelectMenu()) return await handleChannelSelect(interaction);
    if (interaction.isButton()) return await handleButton(interaction);
  } catch (error) {
    if (isStale(error)) return true;
    logger.error(`[greetings] interaction failed: ${error.stack || error.message}`);
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

  if (action === 'back') return showMenu(interaction);

  if (action === 'openkind') return showKind(interaction, payload);

  if (action === 'toggle') {
    const config = await loadConfig(interaction.guildId);
    if (!config[payload]) throw new Error('That greeting does not exist.');
    config[payload].enabled = !config[payload].enabled;
    await greetingStore.save(config);
    return showKind(interaction, payload);
  }

  if (action === 'style') {
    const config = await loadConfig(interaction.guildId);
    const state = config[payload];
    if (!state) throw new Error('That greeting does not exist.');
    state.style = state.style === 'text' ? 'embed' : 'text';
    await greetingStore.save(config);
    return showKind(interaction, payload);
  }

  if (action === 'edit') {
    const config = await loadConfig(interaction.guildId);
    if (!config[payload]) throw new Error('That greeting does not exist.');
    return interaction.showModal(editModal(payload, config));
  }

  if (action === 'channel') {
    const config = await loadConfig(interaction.guildId);
    return show(interaction, renderChannelPicker(config, payload), true);
  }

  if (action === 'placeholders') {
    return show(interaction, renderPlaceholders(payload), true);
  }

  if (action === 'reset') {
    const config = await loadConfig(interaction.guildId);
    return show(interaction, renderResetConfirm(config), true);
  }

  if (action === 'resetcancel') return showMenu(interaction);

  if (action === 'resetok') {
    const config = await loadConfig(interaction.guildId);
    const { emptyConfig } = await import('#services/greetings/logic');
    const fresh = emptyConfig(config.guildId);
    await greetingStore.save(fresh);
    return showMenu(interaction);
  }

  throw new Error('Unknown greeting action.');
}

async function handleSelect(interaction) {
  const [, action] = interaction.customId.split(':');
  if (action === 'open') return showKind(interaction, interaction.values[0]);
  throw new Error('Unknown greeting selection.');
}

async function handleChannelSelect(interaction) {
  const [, action, kind] = interaction.customId.split(':');
  if (action !== 'savechannel') throw new Error('Unknown greeting channel selection.');

  const config = await loadConfig(interaction.guildId);
  if (!config[kind]) throw new Error('That greeting does not exist.');
  config[kind].channelId = interaction.values[0];
  await greetingStore.save(config);
  return showKind(interaction, kind);
}

async function handleModal(interaction) {
  const [, action, kind] = interaction.customId.split(':');
  if (action !== 'edit') throw new Error('Unknown greeting modal.');

  const config = await loadConfig(interaction.guildId);
  const state = config[kind];
  if (!state) throw new Error('That greeting does not exist.');

  state.text = interaction.fields.getTextInputValue('text').slice(0, 1800);

  if (state.style === 'embed') {
    state.embedTitle = interaction.fields.getTextInputValue('title').slice(0, 256);
    const raw = interaction.fields.getTextInputValue('color');
    if (raw) {
      const parsed = Number.parseInt(raw.replace(/[^0-9a-fA-F]/g, ''), 16);
      if (Number.isFinite(parsed)) state.color = Math.min(0xffffff, Math.max(0, parsed));
    }
  }

  await greetingStore.save(config);
  return showKind(interaction, kind);
}
