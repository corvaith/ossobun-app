import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  EmbedBuilder,
  ModalBuilder,
  RoleSelectMenuBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { config as botConfig } from '#config/config';
import { ICONS, ICON_IDS } from '#config/emojis';
import { isAdministrator } from '#services/autoRoles/logic';
import {
  LIMITS,
  RULES,
  RULE_META,
  actionSummary,
  clampInt,
  emptyConfig,
  enabledRules,
  plural,
  ruleSummary,
} from '#services/automod/logic';
import { autoModStore } from '#services/store';
import { logger } from '#utils/logger';

const PREFIX = 'am:';
const mentions = { parse: [] };
const locked = new Set();

const ACTION_LABELS = {
  delete: 'Delete message',
  warn: 'Warn member',
  timeout: 'Time them out',
  kick: 'Kick member',
  ban: 'Ban member',
};

function admin(interaction) {
  return interaction.guild && isAdministrator(interaction.memberPermissions);
}

function isStale(error) {
  return error?.code === 10062 || error?.code === 40060;
}

async function loadConfig(guildId) {
  return autoModStore.get(guildId);
}

function statusLine(config, rule) {
  const state = config[rule];
  if (!state.enabled) return `${ICONS.failed} Off`;
  return `${ICONS.success} ${ruleSummary(config, rule)}`;
}

export function renderMenu(config) {
  const on = enabledRules(config);

  const blocks = RULES.map((rule, index) => {
    const meta = RULE_META[rule];
    return [
      `${ICONS[meta.icon]} **${index + 1}. ${meta.label}**`,
      meta.description,
      statusLine(config, rule),
    ].join('\n');
  }).join('\n\n');

  const logLine = config.logChannelId
    ? `${ICONS.mail} **Log channel** — <#${config.logChannelId}>`
    : `${ICONS.mail} **Log channel** — not set, so incidents are not reported anywhere`;

  return {
    embeds: [
      new EmbedBuilder()
        .setColor(botConfig.colors.info)
        .setTitle(`${ICONS.hammer} AutoMod`)
        .setDescription(
          [
            'Keeps the server clean by catching spam and rule breaking automatically.',
            'Pick a rule below to set it up or change it.',
            '',
            blocks,
            '',
            logLine,
            on.length
              ? `${ICONS.info} ${plural(on.length, 'rule')} active.`
              : `${ICONS.info} Nothing is active yet.`,
          ].join('\n')
        )
        .setFooter({ text: 'Administrators only.' }),
    ],
    components: [
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`${PREFIX}open`)
          .setPlaceholder('Pick a rule to set up')
          .addOptions(
            RULES.map((rule, index) => ({
              label: `${index + 1}. ${RULE_META[rule].label}`,
              value: rule,
              description: config[rule].enabled
                ? ruleSummary(config, rule).slice(0, 100)
                : 'Currently off',
            }))
          )
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`${PREFIX}log`)
          .setLabel('Log channel')
          .setEmoji(ICON_IDS.mail)
          .setStyle(config.logChannelId ? ButtonStyle.Success : ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`${PREFIX}ignore`)
          .setLabel('Ignored')
          .setEmoji(ICON_IDS.filter)
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`${PREFIX}reset`)
          .setLabel('Reset')
          .setEmoji(ICON_IDS.delete)
          .setStyle(ButtonStyle.Danger)
      ),
    ],
  };
}

export function renderRule(config, rule) {
  const state = config[rule];
  const meta = RULE_META[rule];

  const lines = [
    meta.description,
    '',
    `**Status:** ${state.enabled ? `${ICONS.success} On` : `${ICONS.failed} Off`}`,
  ];

  if (rule === 'spam') {
    lines.push(`**Limit:** ${state.count} messages per ${plural(state.seconds, 'second')}`);
  }
  if (rule === 'images') {
    lines.push(`**Limit:** ${state.count} images per ${plural(state.seconds, 'second')}`);
  }
  if (rule === 'mentions') {
    lines.push(`**Limit:** ${state.count} mentions in one message`);
  }
  if (rule === 'links') {
    lines.push(`**Limit:** ${state.count} links per ${plural(state.seconds, 'second')}`);
  }
  if (rule === 'duplicates') {
    lines.push(`**Limit:** ${state.count} repeats per ${plural(state.seconds, 'second')}`);
  }
  if (rule === 'caps') {
    lines.push(
      `**Limit:** ${state.percent}% caps, ignoring messages under ${state.minLength} letters`
    );
  }

  lines.push('', '**What happens**');
  for (const action of state.actions) {
    lines.push(`${ICONS.check} ${ACTION_LABELS[action]}`);
  }

  return {
    embeds: [
      new EmbedBuilder()
        .setColor(botConfig.colors.info)
        .setTitle(`${ICONS[meta.icon]} ${meta.label}`)
        .setDescription(lines.join('\n')),
    ],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`${PREFIX}toggle:${rule}`)
          .setLabel(state.enabled ? 'Turn off' : 'Turn on')
          .setEmoji(state.enabled ? ICON_IDS.failed : ICON_IDS.success)
          .setStyle(state.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`${PREFIX}limits:${rule}`)
          .setLabel('Set limits')
          .setEmoji(ICON_IDS.edit)
          .setStyle(ButtonStyle.Primary)
          .setDisabled(!canTune(rule)),
        new ButtonBuilder()
          .setCustomId(`${PREFIX}actions:${rule}`)
          .setLabel('Punishment')
          .setEmoji(ICON_IDS.hammer)
          .setStyle(ButtonStyle.Primary)
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`${PREFIX}back`)
          .setLabel('Back')
          .setStyle(ButtonStyle.Secondary)
      ),
    ],
  };
}

function canTune(rule) {
  return rule !== 'invites';
}

export function renderActions(config, rule) {
  const state = config[rule];
  const options = Object.entries(ACTION_LABELS).map(([value, label]) => ({
    label,
    value,
    default: state.actions.includes(value),
  }));

  return {
    embeds: [
      new EmbedBuilder()
        .setColor(botConfig.colors.info)
        .setTitle(`${ICONS.hammer} Punishment for ${RULE_META[rule].label}`)
        .setDescription(
          [
            'Pick everything that should happen when this rule is broken.',
            'They run in the order shown, top to bottom.',
            '',
            `${ICONS.info} Right now: **${actionSummary(state)}**`,
            '',
            `${ICONS.warning} Timeout, kick and ban are skipped for administrators and for anyone ranked above the bot.`,
          ].join('\n')
        ),
    ],
    components: [
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`${PREFIX}saveactions:${rule}`)
          .setPlaceholder('Pick the punishments')
          .setMinValues(1)
          .setMaxValues(Object.keys(ACTION_LABELS).length)
          .addOptions(options)
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`${PREFIX}openrule:${rule}`)
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Secondary)
      ),
    ],
  };
}

export function renderLogPicker(config) {
  return {
    embeds: [
      new EmbedBuilder()
        .setColor(botConfig.colors.info)
        .setTitle(`${ICONS.mail} AutoMod Log Channel`)
        .setDescription(
          [
            'Every time AutoMod acts, a short report is posted here.',
            'Leave it unset and nothing is reported.',
            '',
            config.logChannelId
              ? `${ICONS.check} Currently: <#${config.logChannelId}>`
              : `${ICONS.warning} No channel set yet.`,
          ].join('\n')
        ),
    ],
    components: [
      new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId(`${PREFIX}savelog`)
          .setPlaceholder('Pick the log channel')
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`${PREFIX}clearlog`)
          .setLabel('Turn logging off')
          .setEmoji(ICON_IDS.failed)
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`${PREFIX}back`)
          .setLabel('Back')
          .setStyle(ButtonStyle.Secondary)
      ),
    ],
  };
}

export function renderIgnore(config) {
  const channels = config.ignoredChannelIds.length
    ? config.ignoredChannelIds.map((id) => `<#${id}>`).join(', ')
    : '_none_';
  const roles = config.ignoredRoleIds.length
    ? config.ignoredRoleIds.map((id) => `<@&${id}>`).join(', ')
    : '_none_';

  return {
    embeds: [
      new EmbedBuilder()
        .setColor(botConfig.colors.info)
        .setTitle(`${ICONS.filter} Ignored Channels and Roles`)
        .setDescription(
          [
            'Messages here are never checked by AutoMod.',
            'Handy for staff channels, bot spam and your own announcement feeds.',
            '',
            `**Channels:** ${channels}`,
            `**Roles:** ${roles}`,
          ].join('\n')
        ),
    ],
    components: [
      new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId(`${PREFIX}saveignorechannels`)
          .setPlaceholder('Pick channels to ignore')
          .setMinValues(1)
          .setMaxValues(10)
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      ),
      new ActionRowBuilder().addComponents(
        new RoleSelectMenuBuilder()
          .setCustomId(`${PREFIX}saveignoreroles`)
          .setPlaceholder('Pick roles to ignore')
          .setMinValues(1)
          .setMaxValues(10)
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`${PREFIX}clearignore`)
          .setLabel('Clear all')
          .setEmoji(ICON_IDS.delete)
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`${PREFIX}back`)
          .setLabel('Back')
          .setStyle(ButtonStyle.Secondary)
      ),
    ],
  };
}

export function renderResetConfirm(config) {
  const on = enabledRules(config);
  return {
    embeds: [
      new EmbedBuilder()
        .setColor(botConfig.colors.error)
        .setTitle(`${ICONS.warning} Reset AutoMod?`)
        .setDescription(
          [
            'Every rule goes back to its default and turns off.',
            '',
            on.length
              ? `Rules that will be turned off: **${on.map((rule) => RULE_META[rule].label).join(', ')}**`
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

export function limitsModal(rule, config) {
  const state = config[rule];
  const modal = new ModalBuilder().setCustomId(`${PREFIX}limits:${rule}`);

  if (rule === 'spam') {
    return modal
      .setTitle('Spam limit')
      .addComponents(
        numberRow(
          'count',
          `Messages allowed (${LIMITS.spamCount.min}-${LIMITS.spamCount.max})`,
          state.count
        ),
        numberRow(
          'seconds',
          `Within how many seconds (${LIMITS.spamSeconds.min}-${LIMITS.spamSeconds.max})`,
          state.seconds
        )
      );
  }
  if (rule === 'images') {
    return modal
      .setTitle('Image limit')
      .addComponents(
        numberRow(
          'count',
          `Images allowed (${LIMITS.imageCount.min}-${LIMITS.imageCount.max})`,
          state.count
        ),
        numberRow(
          'seconds',
          `Within how many seconds (${LIMITS.imageSeconds.min}-${LIMITS.imageSeconds.max})`,
          state.seconds
        )
      );
  }
  if (rule === 'mentions') {
    return modal
      .setTitle('Mention limit')
      .addComponents(
        numberRow(
          'count',
          `Mentions allowed (${LIMITS.mentionCount.min}-${LIMITS.mentionCount.max})`,
          state.count
        )
      );
  }
  if (rule === 'links') {
    return modal
      .setTitle('Link limit')
      .addComponents(
        numberRow(
          'count',
          `Links allowed (${LIMITS.linkCount.min}-${LIMITS.linkCount.max})`,
          state.count
        ),
        numberRow(
          'seconds',
          `Within how many seconds (${LIMITS.linkSeconds.min}-${LIMITS.linkSeconds.max})`,
          state.seconds
        )
      );
  }
  if (rule === 'duplicates') {
    return modal
      .setTitle('Repeat limit')
      .addComponents(
        numberRow(
          'count',
          `Repeats allowed (${LIMITS.duplicateCount.min}-${LIMITS.duplicateCount.max})`,
          state.count
        ),
        numberRow(
          'seconds',
          `Within how many seconds (${LIMITS.duplicateSeconds.min}-${LIMITS.duplicateSeconds.max})`,
          state.seconds
        )
      );
  }
  return modal
    .setTitle('Caps limit')
    .addComponents(
      numberRow(
        'percent',
        `Percent caps (${LIMITS.capsPercent.min}-${LIMITS.capsPercent.max})`,
        state.percent
      ),
      numberRow(
        'minLength',
        `Ignore messages shorter than (${LIMITS.capsMinLength.min}-${LIMITS.capsMinLength.max})`,
        state.minLength
      )
    );
}

function numberRow(id, label, value) {
  return new ActionRowBuilder().addComponents(
    new TextInputBuilder()
      .setCustomId(id)
      .setLabel(label.slice(0, 45))
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setValue(String(value))
  );
}

function show(interaction, payload, edit) {
  if (edit) return interaction.update({ ...payload, allowedMentions: mentions });
  return interaction.reply({ ...payload, ephemeral: true, allowedMentions: mentions });
}

export async function startAutoModCommand(interaction) {
  if (!admin(interaction)) {
    return interaction.reply({
      content: `${ICONS.lock} Only administrators can change AutoMod.`,
      ephemeral: true,
      allowedMentions: mentions,
    });
  }
  const config = await loadConfig(interaction.guildId);
  return show(interaction, renderMenu(config), false);
}

async function showRule(interaction, rule, edit = true) {
  const config = await loadConfig(interaction.guildId);
  return show(interaction, renderRule(config, rule), edit);
}

async function showMenu(interaction, edit = true) {
  const config = await loadConfig(interaction.guildId);
  return show(interaction, renderMenu(config), edit);
}

export async function handleAutoModInteraction(interaction) {
  if (!interaction.customId?.startsWith(PREFIX)) return false;
  if (locked.has(interaction.id)) return true;
  locked.add(interaction.id);

  try {
    if (!admin(interaction)) {
      const payload = {
        content: `${ICONS.lock} Only administrators can change AutoMod.`,
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
    if (interaction.isRoleSelectMenu()) return await handleRoleSelect(interaction);
    if (interaction.isButton()) return await handleButton(interaction);
  } catch (error) {
    if (isStale(error)) return true;
    logger.error(`[automod] interaction failed: ${error.stack || error.message}`);
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

  if (action === 'log') {
    const config = await loadConfig(interaction.guildId);
    return show(interaction, renderLogPicker(config), true);
  }

  if (action === 'ignore') {
    const config = await loadConfig(interaction.guildId);
    return show(interaction, renderIgnore(config), true);
  }

  if (action === 'clearlog') {
    const config = await loadConfig(interaction.guildId);
    config.logChannelId = null;
    await autoModStore.save(config);
    return showMenu(interaction);
  }

  if (action === 'clearignore') {
    const config = await loadConfig(interaction.guildId);
    config.ignoredChannelIds = [];
    config.ignoredRoleIds = [];
    await autoModStore.save(config);
    const fresh = await loadConfig(interaction.guildId);
    return show(interaction, renderIgnore(fresh), true);
  }

  if (action === 'reset') {
    const config = await loadConfig(interaction.guildId);
    return show(interaction, renderResetConfirm(config), true);
  }

  if (action === 'resetcancel') return showMenu(interaction);

  if (action === 'resetok') {
    const config = await loadConfig(interaction.guildId);
    const fresh = emptyConfig(config.guildId);
    await autoModStore.save(fresh);
    return show(interaction, renderMenu(fresh), true);
  }

  if (action === 'openrule') return showRule(interaction, payload);

  if (action === 'toggle') {
    const config = await loadConfig(interaction.guildId);
    if (!config[payload]) throw new Error('That rule does not exist.');
    config[payload].enabled = !config[payload].enabled;
    await autoModStore.save(config);
    const fresh = await loadConfig(interaction.guildId);
    return show(interaction, renderRule(fresh, payload), true);
  }

  if (action === 'limits') {
    const config = await loadConfig(interaction.guildId);
    return interaction.showModal(limitsModal(payload, config));
  }

  if (action === 'actions') {
    const config = await loadConfig(interaction.guildId);
    return show(interaction, renderActions(config, payload), true);
  }

  throw new Error('Unknown AutoMod action.');
}

async function handleSelect(interaction) {
  const [, action, payload] = interaction.customId.split(':');

  if (action === 'open') {
    return showRule(interaction, interaction.values[0]);
  }

  if (action === 'saveactions') {
    const config = await loadConfig(interaction.guildId);
    if (!config[payload]) throw new Error('That rule does not exist.');
    config[payload].actions = interaction.values;
    await autoModStore.save(config);
    const fresh = await loadConfig(interaction.guildId);
    return show(interaction, renderRule(fresh, payload), true);
  }

  throw new Error('Unknown AutoMod selection.');
}

async function handleChannelSelect(interaction) {
  const [, action] = interaction.customId.split(':');
  const config = await loadConfig(interaction.guildId);

  if (action === 'savelog') {
    config.logChannelId = interaction.values[0];
    await autoModStore.save(config);
    return showMenu(interaction);
  }

  if (action === 'saveignorechannels') {
    config.ignoredChannelIds = interaction.values;
    await autoModStore.save(config);
    const fresh = await loadConfig(interaction.guildId);
    return show(interaction, renderIgnore(fresh), true);
  }

  throw new Error('Unknown AutoMod channel selection.');
}

async function handleRoleSelect(interaction) {
  const [, action] = interaction.customId.split(':');
  const config = await loadConfig(interaction.guildId);

  if (action === 'saveignoreroles') {
    config.ignoredRoleIds = interaction.values;
    await autoModStore.save(config);
    const fresh = await loadConfig(interaction.guildId);
    return show(interaction, renderIgnore(fresh), true);
  }

  throw new Error('Unknown AutoMod role selection.');
}

async function handleModal(interaction) {
  const [, action, rule] = interaction.customId.split(':');
  if (action !== 'limits') throw new Error('Unknown AutoMod modal.');

  const config = await loadConfig(interaction.guildId);
  const state = config[rule];
  if (!state) throw new Error('That rule does not exist.');

  const read = (id) => interaction.fields.getTextInputValue(id);

  if (rule === 'spam') {
    state.count = clampInt(read('count'), LIMITS.spamCount);
    state.seconds = clampInt(read('seconds'), LIMITS.spamSeconds);
  } else if (rule === 'images') {
    state.count = clampInt(read('count'), LIMITS.imageCount);
    state.seconds = clampInt(read('seconds'), LIMITS.imageSeconds);
  } else if (rule === 'mentions') {
    state.count = clampInt(read('count'), LIMITS.mentionCount);
  } else if (rule === 'links') {
    state.count = clampInt(read('count'), LIMITS.linkCount);
    state.seconds = clampInt(read('seconds'), LIMITS.linkSeconds);
  } else if (rule === 'duplicates') {
    state.count = clampInt(read('count'), LIMITS.duplicateCount);
    state.seconds = clampInt(read('seconds'), LIMITS.duplicateSeconds);
  } else {
    state.percent = clampInt(read('percent'), LIMITS.capsPercent);
    state.minLength = clampInt(read('minLength'), LIMITS.capsMinLength);
  }

  await autoModStore.save(config);
  const fresh = await loadConfig(interaction.guildId);
  return show(interaction, renderRule(fresh, rule), true);
}
