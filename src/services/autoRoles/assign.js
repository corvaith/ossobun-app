import { PermissionFlagsBits } from 'discord.js';
import { ICONS } from '#config/emojis';
import { isSafeRole } from '#services/selfRoles/logic';
import { logger } from '#utils/logger';

export async function grantRoles(
  member,
  roleIds,
  { reason, dm = true, source = 'auto-role' } = {}
) {
  const guild = member.guild;
  const me = guild.members.me ?? (await guild.members.fetchMe().catch(() => null));
  if (!me?.permissions.has(PermissionFlagsBits.ManageRoles)) {
    logger.warn(`[${source}] Cannot assign roles in ${guild.id}: missing Manage Roles.`);
    return [];
  }

  const added = [];
  for (const roleId of roleIds) {
    if (member.roles.cache.has(roleId)) continue;

    const role =
      guild.roles.cache.get(roleId) ?? (await guild.roles.fetch(roleId).catch(() => null));
    if (!role) {
      logger.warn(`[${source}] Role ${roleId} no longer exists in ${guild.id}.`);
      continue;
    }
    if (!isSafeRole(role, me.roles.highest)) {
      logger.warn(`[${source}] Skipping unsafe or unmanageable role ${role.name} in ${guild.id}.`);
      continue;
    }

    try {
      await member.roles.add(role, reason);
      added.push(role.name);
    } catch (error) {
      logger.warn(`[${source}] Failed to add ${role.name} to ${member.id}: ${error.message}`);
    }
  }

  if (added.length && dm) {
    await notifyMember(member, added, reason).catch(() => null);
  }

  return added;
}

export async function notifyMember(member, roleNames, reason) {
  const list = roleNames.map((name) => `${ICONS.success} **${name}**`).join('\n');
  const content = [
    `You received a new role in **${member.guild.name}**!`,
    '',
    list,
    '',
    reason ? `Reason: ${reason}` : '',
    '',
    'If you think this is a mistake, contact a server administrator.',
  ]
    .filter(Boolean)
    .join('\n');

  try {
    await member.send({ content, allowedMentions: { parse: [] } });
    return true;
  } catch (error) {
    logger.info(`Could not DM ${member.id} in ${member.guild.id}: ${error.message}`);
    return false;
  }
}
