import { PermissionFlagsBits } from 'discord.js';
import { ICONS } from '#config/emojis';
import { isSafeRole } from '#services/selfRoles/logic';
import { autoRoleStore } from '#services/store';

export const FEATURES = ['join', 'timed', 'invite', 'activity'];

export const FEATURE_META = {
  join: {
    label: 'Welcome Role',
    icon: 'link',
    description: 'Gives a role the moment someone joins the server.',
  },
  timed: {
    label: 'Tenure Role',
    icon: 'loading',
    description: 'Gives a role once a member has stayed for a set number of days.',
  },
  invite: {
    label: 'Invite Reward',
    icon: 'mail',
    description: 'Gives a role once a member’s invites have brought in enough people.',
  },
  activity: {
    label: 'Active Member',
    icon: 'code',
    description: 'Gives a role once a member has sent enough messages within a set time.',
  },
};

export const DM_LABEL = 'DM Notice';
export const DM_DESCRIPTION = 'Sends the member a direct message when a role is given to them.';

export const FEATURE_LABELS = {
  join: FEATURE_META.join.label,
  timed: FEATURE_META.timed.label,
  invite: FEATURE_META.invite.label,
  activity: FEATURE_META.activity.label,
};

export const RESET_TARGETS = {
  join: FEATURE_META.join.label,
  timed: FEATURE_META.timed.label,
  invite: FEATURE_META.invite.label,
  activity: FEATURE_META.activity.label,
  dmNotification: DM_LABEL,
};

export const LIMITS = {
  timedDays: { min: 1, max: 365, default: 7 },
  inviteCount: { min: 1, max: 1000, default: 10 },
  activityMessages: { min: 1, max: 1000, default: 5 },
  activityDays: { min: 1, max: 365, default: 7 },
};

export function emptyConfig(guildId) {
  return {
    guildId,
    dmNotification: true,
    join: { enabled: false, roleIds: [] },
    timed: { enabled: false, days: LIMITS.timedDays.default, roleIds: [] },
    invite: { enabled: false, count: LIMITS.inviteCount.default, roleIds: [] },
    activity: {
      enabled: false,
      messages: LIMITS.activityMessages.default,
      days: LIMITS.activityDays.default,
      roleIds: [],
    },
  };
}

export function normalizeConfig(guildId, stored) {
  const base = emptyConfig(guildId);
  if (!stored || typeof stored !== 'object') return base;

  return {
    guildId,
    dmNotification: stored.dmNotification !== false,
    join: { ...base.join, ...stored.join, roleIds: cleanIds(stored.join?.roleIds) },
    timed: {
      ...base.timed,
      ...stored.timed,
      days: clampInt(stored.timed?.days, LIMITS.timedDays, base.timed.days),
      roleIds: cleanIds(stored.timed?.roleIds),
    },
    invite: {
      ...base.invite,
      ...stored.invite,
      count: clampInt(stored.invite?.count, LIMITS.inviteCount, base.invite.count),
      roleIds: cleanIds(stored.invite?.roleIds),
    },
    activity: {
      ...base.activity,
      ...stored.activity,
      messages: clampInt(
        stored.activity?.messages,
        LIMITS.activityMessages,
        base.activity.messages
      ),
      days: clampInt(stored.activity?.days, LIMITS.activityDays, base.activity.days),
      roleIds: cleanIds(stored.activity?.roleIds),
    },
  };
}

export function cleanIds(ids) {
  if (!Array.isArray(ids)) return [];
  return [...new Set(ids.filter((id) => typeof id === 'string' && /^\d{5,25}$/.test(id)))];
}

export function clampInt(value, { min, max, default: fallback }) {
  const parsed = Number.parseInt(value, 10);
  const base = Number.isNaN(parsed) ? fallback : parsed;
  return Math.min(max, Math.max(min, base));
}

export function hasAnyFeature(config) {
  return FEATURES.some((feature) => config[feature]?.enabled);
}

export function isAdministrator(permissions) {
  return Boolean(permissions?.has(PermissionFlagsBits.Administrator));
}

export function isSafeAutoRole(role, botHighestRole) {
  return isSafeRole(role, botHighestRole);
}

export function enabledFeatures(config) {
  return FEATURES.filter((feature) => config[feature]?.enabled);
}

export function resetFeatures(config, keys) {
  const base = emptyConfig(config.guildId);
  const next = { ...config };

  for (const key of keys) {
    if (key === 'dmNotification') next.dmNotification = base.dmNotification;
    else if (base[key]) next[key] = structuredClone(base[key]);
  }

  return next;
}

export function describeReset(config, keys) {
  return keys.map((key) => {
    if (key === 'dmNotification') {
      return `${ICONS.mail} **${RESET_TARGETS[key]}** — turned back on`;
    }

    const state = config[key];
    const roles = state?.roleIds?.length ?? 0;
    const detail =
      key === 'timed'
        ? `after ${formatDays(state.days)}`
        : key === 'invite'
          ? `at ${formatInvites(state.count)}`
          : key === 'activity'
            ? `at ${formatMessages(state.messages)} in ${formatDays(state.days)}`
            : '';

    if (!state?.enabled && !roles) {
      return `${ICONS.failed} **${RESET_TARGETS[key]}** — already off, nothing to clear`;
    }

    const mark = state?.enabled ? ICONS.success : ICONS.warning;
    return `${mark} **${RESET_TARGETS[key]}** — ${state?.enabled ? 'on' : 'off'}, ${formatRoles(roles)}${detail ? `, ${detail}` : ''}`;
  });
}

export function findUsedInvites(before, after) {
  const used = [];
  for (const invite of after.values()) {
    const previousUses = before.get(invite.code) ?? 0;
    if ((invite.uses ?? 0) > previousUses) used.push(invite);
  }
  return used;
}

export function hasElapsed(joinedAt, days, now = Date.now()) {
  if (!joinedAt) return false;
  return now - joinedAt >= days * 24 * 60 * 60 * 1000;
}

export function formatDays(days) {
  return days === 1 ? '1 day' : `${days} days`;
}

export function formatRoles(count) {
  return count === 1 ? '1 role' : `${count} roles`;
}

export function formatMessages(count) {
  return count === 1 ? '1 message' : `${count} messages`;
}

export function formatInvites(count) {
  return count === 1 ? '1 invite' : `${count} invites`;
}

export async function loadAutoRoleConfig(guildId) {
  return autoRoleStore.get(guildId);
}

export async function saveAutoRoleConfig(config) {
  const clean = {};
  for (const [key, value] of Object.entries(config)) {
    if (key.startsWith('__')) continue;
    clean[key] = value;
  }
  await autoRoleStore.save(clean);
  return clean;
}
