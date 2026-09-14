import { Events } from 'discord.js';
import { grantRoles } from '#services/autoRoles/assign';
import { findUsedInvites } from '#services/autoRoles/logic';
import { autoRoleStore, memberStore } from '#services/store';
import { logger } from '#utils/logger';

export const name = Events.GuildMemberAdd;
export const once = false;

export async function execute(member, client) {
  const guild = member.guild;
  const config = await autoRoleStore.get(guild.id);

  await memberStore.recordJoin(guild.id, member.id, member.joinedTimestamp ?? Date.now());

  if (config.join.enabled && config.join.roleIds.length) {
    const added = await grantRoles(member, config.join.roleIds, {
      reason: 'Auto role on join',
      dm: config.dmNotification,
      source: 'join',
    });
    if (added.length) logger.success(`[join] Gave ${added.join(', ')} to ${member.user.tag}.`);
  }

  if (config.invite.enabled && config.invite.roleIds.length) {
    await trackInviteJoin(member, config).catch((error) =>
      logger.warn(`[invite] Tracking failed for ${member.id}: ${error.message}`)
    );
  }
}

async function trackInviteJoin(member, config) {
  const guild = member.guild;
  const invites = await guild.invites.fetch();

  const before = await memberStore.getInviteSnapshot(guild.id);
  const used = findUsedInvites(before, invites);

  await memberStore.replaceInviteSnapshot(
    guild.id,
    [...invites.values()].map((invite) => [invite.code, invite.uses ?? 0])
  );

  for (const invite of used) {
    const inviterId = invite.inviter?.id;
    if (!inviterId || inviterId === member.id) continue;

    const count = await memberStore.incrementInviteCount(guild.id, inviterId);
    if (count < config.invite.count) continue;

    const inviter = await guild.members.fetch(inviterId).catch(() => null);
    if (!inviter) continue;

    const added = await grantRoles(inviter, config.invite.roleIds, {
      reason: `Reached ${count} invite(s)`,
      dm: config.dmNotification,
      source: 'invite',
    });
    if (added.length) logger.success(`[invite] ${inviter.user.tag} earned ${added.join(', ')}.`);
  }
}
