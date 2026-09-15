/**
 * Pure automod logic: config shape, rule evaluation and punishment escalation.
 *
 * Every rule is rate-based rather than a plain keyword filter, because spam is
 * about frequency. A rule can also carry its own punishment chain, so a server
 * can escalate delete -> timeout -> kick instead of always nuking a member.
 *
 * Nothing here touches discord.js or the database, which keeps it cheap to test
 * and safe to call from a hot path like messageCreate.
 */

export const RULES = ['spam', 'images', 'mentions', 'links', 'invites', 'caps', 'duplicates'];

export const ACTIONS = ['delete', 'warn', 'timeout', 'kick', 'ban'];

export const LIMITS = {
  spamCount: { min: 2, max: 30, def: 5 },
  spamSeconds: { min: 1, max: 120, def: 5 },
  imageCount: { min: 2, max: 30, def: 5 },
  imageSeconds: { min: 1, max: 300, def: 30 },
  mentionCount: { min: 2, max: 50, def: 5 },
  linkCount: { min: 1, max: 20, def: 2 },
  linkSeconds: { min: 1, max: 300, def: 10 },
  capsPercent: { min: 50, max: 100, def: 70 },
  capsMinLength: { min: 5, max: 100, def: 12 },
  duplicateCount: { min: 2, max: 20, def: 3 },
  duplicateSeconds: { min: 5, max: 600, def: 60 },
  timeoutMinutes: { min: 1, max: 10080, def: 10 },
};

export const RULE_META = {
  spam: {
    label: 'Message Spam',
    icon: 'processing',
    description: 'Catches members firing off many messages in a very short time.',
    window: 'spamCount',
  },
  images: {
    label: 'Image Spam',
    icon: 'cloud',
    description: 'Catches members dumping attachments and embeds in a burst.',
    window: 'imageCount',
  },
  mentions: {
    label: 'Mention Spam',
    icon: 'panic',
    description: 'Catches members mass-pinging people in a single message.',
    window: 'mentionCount',
  },
  links: {
    label: 'Link Spam',
    icon: 'link',
    description: 'Catches members dropping links faster than the limit allows.',
    window: 'linkCount',
  },
  invites: {
    label: 'Invite Spam',
    icon: 'web',
    description: 'Removes Discord invites posted by members.',
    window: null,
  },
  caps: {
    label: 'Excessive Caps',
    icon: 'warning',
    description: 'Catches messages that are mostly SHOUTING.',
    window: null,
  },
  duplicates: {
    label: 'Repeated Messages',
    icon: 'sync',
    description: 'Catches the same message being posted over and over.',
    window: 'duplicateCount',
  },
};

const INVITE_PATTERN = /(?:discord\.(?:gg|io|me|li)|discord(?:app)?\.com\/invite)\/([a-z0-9-]+)/i;
const LINK_PATTERN = /https?:\/\/\S+|www\.\S+/i;
const IMAGE_PATTERN = /\.(png|jpe?g|gif|webp|bmp|avif)(\?|$)/i;

export function emptyConfig(guildId) {
  const config = { guildId, logChannelId: null, ignoredChannelIds: [], ignoredRoleIds: [] };
  for (const rule of RULES) {
    config[rule] = {
      enabled: false,
      actions: ['delete'],
      ...thresholdsFor(rule),
    };
  }
  return config;
}

function thresholdsFor(rule) {
  switch (rule) {
    case 'spam':
      return { count: LIMITS.spamCount.def, seconds: LIMITS.spamSeconds.def };
    case 'images':
      return { count: LIMITS.imageCount.def, seconds: LIMITS.imageSeconds.def };
    case 'mentions':
      return { count: LIMITS.mentionCount.def };
    case 'links':
      return { count: LIMITS.linkCount.def, seconds: LIMITS.linkSeconds.def };
    case 'caps':
      return { percent: LIMITS.capsPercent.def, minLength: LIMITS.capsMinLength.def };
    case 'duplicates':
      return { count: LIMITS.duplicateCount.def, seconds: LIMITS.duplicateSeconds.def };
    default:
      return {};
  }
}

export function clampInt(value, { min, max, def }) {
  const parsed = Number.parseInt(String(value ?? '').replace(/[^0-9-]/g, ''), 10);
  if (!Number.isFinite(parsed)) return def;
  return Math.min(max, Math.max(min, parsed));
}

export function normalizeConfig(guildId, raw) {
  const base = emptyConfig(guildId);
  if (!raw || typeof raw !== 'object') return base;

  base.logChannelId = typeof raw.logChannelId === 'string' ? raw.logChannelId : null;
  base.ignoredChannelIds = cleanIds(raw.ignoredChannelIds);
  base.ignoredRoleIds = cleanIds(raw.ignoredRoleIds);

  for (const rule of RULES) {
    const saved = raw[rule];
    if (!saved || typeof saved !== 'object') continue;
    const state = base[rule];

    state.enabled = Boolean(saved.enabled);
    const actions = Array.isArray(saved.actions)
      ? saved.actions.filter((action) => ACTIONS.includes(action))
      : [];
    state.actions = actions.length ? actions : ['delete'];

    const bounds = thresholdsFor(rule);
    for (const key of Object.keys(bounds)) {
      const limit = limitFor(rule, key);
      if (limit) state[key] = clampInt(saved[key], limit);
    }
  }

  return base;
}

function limitFor(rule, key) {
  const map = {
    'spam.count': 'spamCount',
    'spam.seconds': 'spamSeconds',
    'images.count': 'imageCount',
    'images.seconds': 'imageSeconds',
    'mentions.count': 'mentionCount',
    'links.count': 'linkCount',
    'links.seconds': 'linkSeconds',
    'caps.percent': 'capsPercent',
    'caps.minLength': 'capsMinLength',
    'duplicates.count': 'duplicateCount',
    'duplicates.seconds': 'duplicateSeconds',
  };
  return LIMITS[map[`${rule}.${key}`]] ?? null;
}

function cleanIds(list) {
  if (!Array.isArray(list)) return [];
  return [...new Set(list.filter((id) => typeof id === 'string' && /^\d{5,25}$/.test(id)))];
}

export function isIgnored(config, message) {
  if (!config.ignoredChannelIds.length && !config.ignoredRoleIds.length) return false;
  if (config.ignoredChannelIds.includes(message.channelId)) return true;
  const roles = message.member?.roles?.cache;
  if (!roles || !config.ignoredRoleIds.length) return false;
  return config.ignoredRoleIds.some((id) => roles.has(id));
}

export function hasInvite(content) {
  return INVITE_PATTERN.test(content);
}

export function hasLink(content) {
  return LINK_PATTERN.test(content);
}

export function countImages(message) {
  const attachments = message.attachments?.size ?? 0;
  let embeds = 0;
  for (const embed of message.embeds ?? []) {
    if (embed.image || embed.thumbnail || embed.video) embeds += 1;
  }
  return attachments + embeds;
}

export function capsRatio(content) {
  const letters = content.replace(/[^a-zA-Z]/g, '');
  if (!letters.length) return 0;
  const upper = letters.replace(/[^A-Z]/g, '').length;
  return Math.round((upper / letters.length) * 100);
}

/**
 * Counts how many messages in the window break a given rule.
 * `history` is newest-last and scoped to one member across the whole guild, so a
 * burst spread over several channels counts as one burst.
 */
export function countInWindow(history, now, seconds) {
  const since = now - seconds * 1000;
  return history.filter((entry) => entry.at >= since).length;
}

export function matches(rule, config, message, history, now) {
  const state = config[rule];
  if (!state.enabled) return false;

  switch (rule) {
    case 'spam':
      return countInWindow(history, now, state.seconds) >= state.count;
    case 'images': {
      const recent = history.filter((entry) => entry.at >= now - state.seconds * 1000);
      const images =
        recent.reduce((sum, entry) => sum + (entry.images ?? 0), 0) + countImages(message);
      return images >= state.count;
    }
    case 'mentions':
      return (
        (message.mentions?.users?.size ?? 0) + (message.mentions?.roles?.size ?? 0) >= state.count
      );
    case 'links': {
      if (!hasLink(message.content)) return false;
      const withLinks = history.filter(
        (entry) => entry.at >= now - state.seconds * 1000 && entry.link
      ).length;
      return withLinks + 1 >= state.count;
    }
    case 'invites':
      return hasInvite(message.content);
    case 'caps': {
      const content = message.content ?? '';
      if (content.length < state.minLength) return false;
      return capsRatio(content) >= state.percent;
    }
    case 'duplicates': {
      const normalized = normalizeText(message.content);
      if (!normalized) return false;
      const repeats = history.filter(
        (entry) => entry.at >= now - state.seconds * 1000 && entry.text === normalized
      ).length;
      return repeats + 1 >= state.count;
    }
    default:
      return false;
  }
}

export function normalizeText(content) {
  return (content ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Returns the first rule that the message trips, or null. */
export function evaluate(config, message, history, now) {
  for (const rule of RULES) {
    if (matches(rule, config, message, history, now)) return rule;
  }
  return null;
}

/** Maps an action onto what we need to actually perform it. */
export function describeAction(action, config) {
  if (action === 'timeout') {
    return `timed out for ${LIMITS.timeoutMinutes.def} minutes`;
  }
  if (action === 'warn') return 'warned';
  if (action === 'kick') return 'kicked';
  if (action === 'ban') return 'banned';
  return 'message removed';
}

export function enabledRules(config) {
  return RULES.filter((rule) => config[rule].enabled);
}

export function ruleSummary(config, rule) {
  const state = config[rule];
  if (!state.enabled) return 'Off';

  if (rule === 'mentions') return `${state.count} mentions in one message`;
  if (rule === 'caps') return `${state.percent}% caps over ${state.minLength} letters`;
  if (rule === 'invites') return 'any invite removed';
  if (rule === 'links') return `${state.count} links per ${plural(state.seconds, 'second')}`;
  if (rule === 'images') return `${state.count} images per ${plural(state.seconds, 'second')}`;
  if (rule === 'duplicates') return `${state.count} repeats per ${plural(state.seconds, 'second')}`;
  return `${state.count} messages per ${plural(state.seconds, 'second')}`;
}

export function plural(count, word) {
  return count === 1 ? `${count} ${word}` : `${count} ${word}s`;
}

export function actionSummary(state) {
  const labels = state.actions.map((action) =>
    action === 'timeout' ? 'timeout' : action === 'warn' ? 'warn' : action
  );
  if (labels.length === 1) return labels[0];
  return `${labels.slice(0, -1).join(', ')} then ${labels.at(-1)}`;
}

export function hasAnyRule(config) {
  return enabledRules(config).length > 0;
}
