import { grantRoles } from '#services/autoRoles/assign';
import { hasElapsed } from '#services/autoRoles/logic';
import { autoRoleStore, memberStore } from '#services/store';
import { logger } from '#utils/logger';

const CHECK_INTERVAL = 10 * 60 * 1000;

export function startTimedRoleScheduler(client) {
  const run = () =>
    checkAllGuilds(client).catch((error) => logger.error(`[timed] ${error.message}`));
  run();
  const timer = setInterval(run, CHECK_INTERVAL);
  timer.unref?.();
  return timer;
}

export async function backfillJoinTimes(client) {
  for (const guild of client.guilds.cache.values()) {
    const config = await autoRoleStore.get(guild.id);
    if (!config.timed.enabled) continue;

    try {
      const members = await guild.members.fetch();
      let added = 0;

      for (const member of members.values()) {
        if (member.user.bot) continue;
        const existing = await memberStore.getJoinTime(guild.id, member.id);
        if (existing !== null) continue;
        await memberStore.recordJoin(guild.id, member.id, member.joinedTimestamp ?? Date.now());
        added++;
      }

      if (added)
        logger.info(`[timed] Backfilled join times for ${added} member(s) in ${guild.name}.`);
    } catch (error) {
      logger.warn(`[timed] Could not backfill ${guild.id}: ${error.message}`);
    }
  }
}

export async function checkAllGuilds(client, now = Date.now()) {
  for (const guild of client.guilds.cache.values()) {
    await checkGuild(guild, now).catch((error) =>
      logger.warn(`[timed] Guild ${guild.id} failed: ${error.message}`)
    );
  }
}

export async function checkGuild(guild, now = Date.now()) {
  const config = await autoRoleStore.get(guild.id);
  if (!config.timed.enabled || !config.timed.roleIds.length) return;

  for (const { userId, joinedAt } of await memberStore.listMembers(guild.id)) {
    if (!hasElapsed(joinedAt, config.timed.days, now)) continue;

    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) continue;
    if (config.timed.roleIds.every((id) => member.roles.cache.has(id))) continue;

    const added = await grantRoles(member, config.timed.roleIds, {
      reason: `Member for ${config.timed.days} day(s)`,
      dm: config.dmNotification,
      source: 'timed',
    });
    if (added.length) logger.success(`[timed] ${member.user.tag} earned ${added.join(', ')}.`);
  }
}
