import { Events } from 'discord.js';
import { grantRoles } from '#services/autoRoles/assign';
import { autoRoleStore, memberStore } from '#services/store';
import { logger } from '#utils/logger';

export const name = Events.MessageCreate;
export const once = false;

export async function execute(message, client) {
  if (message.author.bot || !message.guild) return;

  const guildId = message.guild.id;
  const config = await autoRoleStore.get(guildId);
  if (!config.activity.enabled || !config.activity.roleIds.length) return;

  const now = Date.now();
  const windowMs = config.activity.days * 24 * 60 * 60 * 1000;

  await memberStore.recordJoin(guildId, message.author.id, message.member?.joinedTimestamp ?? null);
  await memberStore.recordActivity(guildId, message.author.id, now);
  await memberStore.trimActivity(guildId, message.author.id, now - windowMs);

  const count = await memberStore.countActivity(guildId, message.author.id, now - windowMs);
  if (count < config.activity.messages) return;

  const member =
    message.member ?? (await message.guild.members.fetch(message.author.id).catch(() => null));
  if (!member) return;
  if (config.activity.roleIds.every((id) => member.roles.cache.has(id))) return;

  const added = await grantRoles(member, config.activity.roleIds, {
    reason: `Active member: ${count} messages in ${config.activity.days} day(s)`,
    dm: config.dmNotification,
    source: 'activity',
  });
  if (added.length) logger.success(`[activity] ${message.author.tag} earned ${added.join(', ')}.`);
}
