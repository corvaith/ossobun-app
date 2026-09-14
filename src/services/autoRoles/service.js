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
  FEATURE_LABELS,
  LIMITS,
  RESET_TARGETS,
  clampInt,
  describeReset,
  formatDays,
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

function featureSummary(config, feature) {
  const state = config[feature];
  const roles = state.roleIds.length;
  if (!state.enabled) return `${ICONS.failed} Disabled`;
  if (!roles) return `${ICONS.warning} Enabled — no roles selected yet`;

  switch (feature) {
    case 'join':
      return `${ICONS.success} Enabled — ${roles} role(s) on join`;
    case 'timed':
      return `${ICONS.success} Enabled — ${roles} role(s) after ${formatDays(state.days)}`;
    case 'invite':
      return `${ICONS.success} Enabled — ${roles} role(s) at ${state.count} invite(s)`;
    case 'activity':
      return `${ICONS.success} Enabled — ${roles} role(s) at ${state.messages} msg / ${formatDays(state.days)}`;
    default:
      return `${ICONS.success} Enabled`;
  }
}

const FEATURE_ICONS = {
  join: ICONS.link,
  timed: ICONS.loading,
  invite: ICONS.mail,
  activity: ICONS.code,
};

function menuEmbed(config) {
  return new EmbedBuilder()
    .setColor(botConfig.colors.info)
    .setTitle(`${ICONS.edit} Auto Role Setup`)
    .setDescription(
      [
        'Configure automatic roles for this server. Pick a feature below to set it up.',
        '',
        `${FEATURE_ICONS.join} **1. ${FEATURE_LABELS.join}**\n${featureSummary(config, 'join')}`,
        '',
        `${FEATURE_ICONS.timed} **2. ${FEATURE_LABELS.timed}**\n${featureSummary(config, 'timed')}`,
        '',
        `${FEATURE_ICONS.invite} **3. ${FEATURE_LABELS.invite}**\n${featureSummary(config, 'invite')}`,
        '',
        `${FEATURE_ICONS.activity} **4. ${FEATURE_LABELS.activity}**\n${featureSummary(config, 'activity')}`,
        '',
        `${ICONS.mail} **5. DM notification**\n${
          config.dmNotification
            ? `${ICONS.success} Members are DM’d when they get a role`
            : `${ICONS.failed} Disabled`
        }`,
      ].join('\n')
    )
    .setFooter({ text: 'Only administrators can change these settings.' });
}

function menuRows(config) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${PREFIX}open:join`)
        .setLabel('1. On join')
        .setEmoji(ICON_IDS.link)
        .setStyle(config.join.enabled ? ButtonStyle.Success : ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`${PREFIX}open:timed`)
        .setLabel('2. Time-based')
        .setEmoji(ICON_IDS.loading)
        .setStyle(config.timed.enabled ? ButtonStyle.Success : ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`${PREFIX}open:invite`)
        .setLabel('3. Invite-based')
        .setEmoji(ICON_IDS.mail)
        .setStyle(config.invite.enabled ? ButtonStyle.Success : ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`${PREFIX}open:activity`)
        .setLabel('4. Activity-based')
        .setEmoji(ICON_IDS.code)
        .setStyle(config.activity.enabled ? ButtonStyle.Success : ButtonStyle.Primary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${PREFIX}dm`)
        .setLabel(`5. DM notification: ${config.dmNotification ? 'ON' : 'OFF'}`)
        .setEmoji(config.dmNotification ? ICON_IDS.success : ICON_IDS.failed)
        .setStyle(config.dmNotification ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`${PREFIX}reset`)
        .setLabel('Reset settings')
        .setEmoji(ICON_IDS.delete)
        .setStyle(ButtonStyle.Danger)
    ),
  ];
}

function featureEmbed(config, feature) {
  const state = config[feature];
  const lines = [
    `**Status:** ${state.enabled ? `${ICONS.success} Enabled` : `${ICONS.failed} Disabled`}`,
  ];

  if (feature === 'timed') lines.push(`**Days required:** ${formatDays(state.days)}`);
  if (feature === 'invite') lines.push(`**Invites required:** ${state.count}`);
  if (feature === 'activity') {
    lines.push(`**Messages required:** ${state.messages}`);
    lines.push(`**Within:** ${formatDays(state.days)}`);
  }

  lines.push('', `**Roles (${state.roleIds.length}):**`);
  if (state.roleIds.length) {
    for (const id of state.roleIds) {
      lines.push(`${ICONS.check} ${roleLabel(config, id)}`);
    }
  } else {
    lines.push('_No roles selected._');
  }

  return new EmbedBuilder()
    .setColor(botConfig.colors.info)
    .setTitle(FEATURE_LABELS[feature])
    .setDescription(lines.join('\n'));
}

function roleLabel(config, id) {
  return config.__roleNames?.[id] ?? `<@&${id}>`;
}

function featureRows(config, feature) {
  const rows = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${PREFIX}toggle:${feature}`)
        .setLabel(config[feature].enabled ? 'Disable' : 'Enable')
        .setStyle(config[feature].enabled ? ButtonStyle.Danger : ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`${PREFIX}roles:${feature}`)
        .setLabel('Set roles')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`${PREFIX}clear:${feature}`)
        .setLabel('Clear roles')
        .setStyle(ButtonStyle.Secondary)
    ),
  ];

  if (feature === 'timed' || feature === 'invite') {
    rows[0].addComponents(
      new ButtonBuilder()
        .setCustomId(`${PREFIX}threshold:${feature}`)
        .setLabel(feature === 'invite' ? 'Set invites' : 'Set days')
        .setStyle(ButtonStyle.Secondary)
    );
  }
  if (feature === 'activity') {
    rows[0].addComponents(
      new ButtonBuilder()
        .setCustomId(`${PREFIX}threshold:activity`)
        .setLabel('Set requirements')
        .setStyle(ButtonStyle.Secondary)
    );
  }

  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${PREFIX}back`)
        .setLabel('Back to menu')
        .setStyle(ButtonStyle.Secondary)
    )
  );

  return rows;
}

async function showMenu(interaction, edit = false) {
  const config = await loadConfig(interaction.guildId);
  const payload = {
    embeds: [menuEmbed(config)],
    components: menuRows(config),
    allowedMentions: mentions,
  };
  if (edit) return interaction.update(payload);
  return interaction.reply({ ...payload, ephemeral: true });
}

async function showResetPicker(interaction, edit = false) {
  const config = await loadConfig(interaction.guildId);
  const active = RESET_KEYS.filter((key) =>
    key === 'dmNotification'
      ? !config.dmNotification
      : config[key]?.enabled || config[key]?.roleIds?.length
  );

  const payload = {
    embeds: [
      new EmbedBuilder()
        .setColor(botConfig.colors.error)
        .setTitle('Reset Auto Role Settings')
        .setDescription(
          [
            'Pick which settings you want to reset. Anything you leave unselected stays untouched.',
            '',
            ...describeReset(config, RESET_KEYS),
            '',
            active.length
              ? `Currently configured: **${active.map((key) => RESET_TARGETS[key]).join(', ')}**`
              : 'Nothing is configured yet.',
          ].join('\n')
        )
        .setFooter({ text: 'You will be asked to confirm before anything is reset.' }),
    ],
    components: [
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`${PREFIX}resetpick`)
          .setPlaceholder('Choose settings to reset')
          .setMinValues(1)
          .setMaxValues(RESET_KEYS.length)
          .addOptions(
            RESET_KEYS.map((key) => ({
              label: RESET_TARGETS[key],
              value: key,
              description: config[key]?.roleIds?.length
                ? `${config[key].roleIds.length} role(s) configured`
                : 'No roles configured',
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
    allowedMentions: mentions,
  };

  if (edit) return interaction.update(payload);
  return interaction.reply({ ...payload, ephemeral: true });
}

async function showResetConfirm(interaction, keys) {
  const config = await loadConfig(interaction.guildId);
  const payload = {
    embeds: [
      new EmbedBuilder()
        .setColor(botConfig.colors.error)
        .setTitle('Confirm Reset')
        .setDescription(
          [
            'These settings will be reset to their defaults:',
            '',
            ...describeReset(config, keys),
            '',
            '**This cannot be undone.**',
          ].join('\n')
        ),
    ],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`${PREFIX}resetok:${keys.join('|')}`)
          .setLabel('Yes, reset them')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`${PREFIX}resetcancel`)
          .setLabel('No, keep them')
          .setStyle(ButtonStyle.Secondary)
      ),
    ],
    allowedMentions: mentions,
  };
  return interaction.update(payload);
}

async function showFeature(interaction, feature, edit = false) {
  const config = await loadConfig(interaction.guildId);
  await decorateRoleNames(config, interaction.guild);
  const payload = {
    embeds: [featureEmbed(config, feature)],
    components: featureRows(config, feature),
    allowedMentions: mentions,
  };
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
      .setTitle('Invites required')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('value')
            .setLabel(`Invites needed (${LIMITS.inviteCount.min}-${LIMITS.inviteCount.max})`)
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setValue(String(config.invite.count))
        )
      );
  }
  if (feature === 'activity') {
    return new ModalBuilder()
      .setCustomId(`${PREFIX}threshold:activity`)
      .setTitle('Activity requirements')
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
            .setLabel(`Within days (${LIMITS.activityDays.min}-${LIMITS.activityDays.max})`)
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setValue(String(config.activity.days))
        )
      );
  }
  return new ModalBuilder()
    .setCustomId(`${PREFIX}threshold:timed`)
    .setTitle('Days required')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('value')
          .setLabel(`Days in server (${LIMITS.timedDays.min}-${LIMITS.timedDays.max})`)
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setValue(String(config.timed.days))
      )
    );
}

export async function startAutoRoleCommand(interaction) {
  if (!admin(interaction)) {
    return interaction.reply({
      content: 'Administrator permission is required.',
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
        content: 'Administrator permission is required.',
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
      content: error.message || 'Auto-role operation failed.',
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
          .setTitle('Settings Reset')
          .setDescription(
            [
              'Reset to defaults:',
              '',
              ...keys.map((key) => `${ICONS.delete} ${RESET_TARGETS[key]}`),
            ].join('\n')
          ),
      ],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`${PREFIX}back`)
            .setLabel('Back to menu')
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
            .setPlaceholder('Select roles to grant')
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

  const rejectedNote = rejected.length
    ? `\n\nSkipped ${rejected.length} unsafe role(s): ${rejected.map((r) => r.name).join(', ')}`
    : '';

  await interaction.update({
    embeds: [
      new EmbedBuilder()
        .setColor(botConfig.colors.info)
        .setTitle(FEATURE_LABELS[feature])
        .setDescription(
          `Saved **${safe.length}** role(s) for ${FEATURE_LABELS[feature]}.${rejectedNote}`
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
