import { PermissionFlagsBits } from 'discord.js';
import { ICONS } from '#config/emojis';
import {
  LIMITS,
  RULE_META,
  countImages,
  evaluate,
  hasInvite,
  hasLink,
  isIgnored,
  normalizeText,
} from '#services/automod/logic';
import { autoModStore } from '#services/store';
import { logger } from '#utils/logger';

/**
 * Recent message history per member+channel, used for rate-based rules.
 * Kept in memory because it only ever needs a short window (seconds to a few
 * minutes) and losing it on restart is harmless.
 */
const HISTORY_TTL = 10 * 60 * 1000;
const histories = new Map();

function key(guildId, channelId, userId) {
  return `${guildId}:${channelId}:${userId}`;
}

function pushHistory(guildId, message, entry) {
  const mapKey = key(guildId, message.channelId, message.author.id);
  const list = histories.get(mapKey) ?? [];
  list.push(entry);

  const cutoff = entry.at - HISTORY_TTL;
  const trimmed = list.filter((item) => item.at >= cutoff);
  histories.set(mapKey, trimmed);

  if (histories.size > 5000) sweep();
}

function getHistory(guildId, message) {
  const list = histories.get(key(guildId, message.channelId, message.author.id)) ?? [];
  const cutoff = Date.now() - HISTORY_TTL;
  return list.filter((entry) => entry.at >= cutoff);
}

function sweep() {
  const cutoff = Date.now() - HISTORY_TTL;
  for (const [mapKey, list] of histories) {
    const trimmed = list.filter((entry) => entry.at >= cutoff);
    if (trimmed.length) histories.set(mapKey, trimmed);
    else histories.delete(mapKey);
  }
}

export function resetHistory() {
  histories.clear();
}

async function canModerate(guild, member) {
  const me = guild.members.me ?? (await guild.members.fetchMe().catch(() => null));
  if (!me) return false;
  if (!me.permissions.has(PermissionFlagsBits.ModerateMembers)) return false;
  if (member.id === guild.ownerId) return false;
  return me.roles.highest.position > member.roles.highest.position;
}

async function applyActions(message, rule, config) {
  const guild = message.guild;
  const member = message.member ?? (await guild.members.fetch(message.author.id).catch(() => null));
  const state = config[rule];
  const applied = [];

  for (const action of state.actions) {
    try {
      if (action === 'delete') {
        await message.delete().catch(() => null);
        applied.push('delete');
      } else if (action === 'warn') {
        await member
          ?.send({
            content: `${ICONS.warning} Your message in **${guild.name}** was removed (${RULE_META[rule].label}). Please keep it civil.`,
            allowedMentions: { parse: [] },
          })
          .catch(() => null);
        applied.push('warn');
      } else if (action === 'timeout') {
        if (!(await canModerate(guild, member))) continue;
        await member.timeout(
          LIMITS.timeoutMinutes.def * 60 * 1000,
          `AutoMod: ${RULE_META[rule].label}`
        );
        applied.push('timeout');
      } else if (action === 'kick') {
        if (!(await canModerate(guild, member))) continue;
        await member.kick(`AutoMod: ${RULE_META[rule].label}`);
        applied.push('kick');
      } else if (action === 'ban') {
        if (!(await canModerate(guild, member))) continue;
        await member.ban({ reason: `AutoMod: ${RULE_META[rule].label}` });
        applied.push('ban');
      }
    } catch (error) {
      logger.warn(`[automod] ${action} failed for ${message.author.id}: ${error.message}`);
    }
  }

  return applied;
}

async function logCase(message, rule, applied) {
  const guild = message.guild;
  const config = await autoModStore.get(guild.id);
  if (!config.logChannelId) return;

  const channel = guild.channels.cache.get(config.logChannelId);
  if (!channel?.isTextBased()) return;

  const snippet = (message.content || '(attachment)').slice(0, 200);
  const lines = [
    `${ICONS.hammer} **${RULE_META[rule].label}** triggered`,
    `${ICONS.info} Member: ${message.author.tag} (${message.author.id})`,
    `${ICONS.link} Channel: <#${message.channelId}>`,
    `${ICONS.warning} Actions: ${applied.join(', ') || 'none'}`,
    '',
    `${ICONS.note} ${snippet}`,
  ];

  await channel
    .send({ content: lines.join('\n'), allowedMentions: { parse: [] } })
    .catch(() => null);
}

/** Entry point called from messageCreate. Returns true when it acted. */
export async function handleMessage(message) {
  if (message.author.bot || !message.guild) return false;

  const guildId = message.guild.id;
  const config = await autoModStore.get(guildId);

  // Ignored channels and roles are skipped entirely so their messages never
  // pollute the rate-limit history either.
  if (isIgnored(config, message)) return false;

  const history = getHistory(guildId, message);
  const now = Date.now();

  const rule = evaluate(config, message, history, now);

  pushHistory(guildId, message, {
    at: now,
    images: countImages(message),
    link: hasLink(message.content),
    invite: hasInvite(message.content),
    text: normalizeText(message.content),
  });

  if (!rule) return false;

  const applied = await applyActions(message, rule, config);
  await autoModStore.recordCase(guildId, message.author.id, rule, applied.join('+'));
  await logCase(message, rule, applied);

  logger.success(`[automod] ${message.author.tag} tripped ${rule} in ${message.guild.name}.`);
  return true;
}
