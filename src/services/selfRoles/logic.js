import { PermissionFlagsBits } from 'discord.js';

const HIGH_RISK_PERMISSIONS = [
  PermissionFlagsBits.Administrator,
  PermissionFlagsBits.ManageGuild,
  PermissionFlagsBits.ManageRoles,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.KickMembers,
  PermissionFlagsBits.BanMembers,
  PermissionFlagsBits.ModerateMembers,
  PermissionFlagsBits.MentionEveryone,
  PermissionFlagsBits.ManageMessages,
  PermissionFlagsBits.ManageWebhooks,
  PermissionFlagsBits.ManageGuildExpressions,
];

export function isAdministrator(permissions) {
  return Boolean(permissions?.has(PermissionFlagsBits.Administrator));
}

export function isSafeRole(role, botHighestRole) {
  return Boolean(
    role &&
      botHighestRole &&
      role.id !== role.guild?.id &&
      !role.managed &&
      role.position < botHighestRole.position &&
      !HIGH_RISK_PERMISSIONS.some((permission) => role.permissions.has(permission))
  );
}

export function validatePanel(panel) {
  return Boolean(
    panel &&
      typeof panel.title === 'string' &&
      panel.title.length > 0 &&
      panel.title.length <= 256 &&
      typeof panel.description === 'string' &&
      panel.description.length > 0 &&
      panel.description.length <= 4000 &&
      (!panel.footer || panel.footer.length <= 2048) &&
      Array.isArray(panel.categories) &&
      panel.categories.some((category) => category.name && category.roleIds?.length)
  );
}

export function calculateCategorySync(configuredRoleIds, memberRoleIds, selectedRoleIds) {
  const configured = new Set(configuredRoleIds);
  const held = new Set(memberRoleIds);
  const selected = new Set(selectedRoleIds.filter((id) => configured.has(id)));
  const add = [...selected].filter((id) => !held.has(id));
  const remove = [...configured].filter((id) => held.has(id) && !selected.has(id));
  const unchanged = [...selected].filter((id) => held.has(id));
  return { add, remove, unchanged };
}

export function parseCustomId(customId) {
  const match = /^sr:panel:([\w-]+):(\d+)$/.exec(customId);
  if (!match) return null;
  return { type: 'panel', categoryId: match[1], page: Number(match[2]) };
}

export function tryLock(locks, key) {
  if (locks.has(key)) return false;
  locks.add(key);
  return true;
}

export function isStaleInteractionError(error) {
  return error?.code === 10062 || error?.code === 40060;
}

export function categoryKey(name) {
  return `${
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 20) || 'category'
  }-${Math.random().toString(36).slice(2, 7)}`;
}
