/**
 * Pure greeting logic: welcome, farewell, ban and DM notices.
 *
 * Each greeting can be sent as a plain message or as an embed, and each one
 * carries its own text with {placeholders} so a server can phrase things its own
 * way. Rendering lives here (no discord.js) so it is cheap to test.
 */

export const KINDS = ['welcome', 'farewell', 'ban', 'dm'];

export const LIMITS = {
  text: { max: 1800 },
  embedTitle: { max: 256 },
  embedColor: { max: 0xffffff },
};

export const KIND_META = {
  welcome: {
    label: 'Welcome Message',
    icon: 'heart',
    description: 'Posted in a channel when someone joins the server.',
    channel: true,
  },
  farewell: {
    label: 'Farewell Message',
    icon: 'cry',
    description: 'Posted in a channel when someone leaves the server.',
    channel: true,
  },
  ban: {
    label: 'Ban Notice',
    icon: 'ban',
    description: 'Posted in a channel when someone is banned.',
    channel: true,
  },
  dm: {
    label: 'Join DM',
    icon: 'mail',
    description: 'Sent privately to the member the moment they join.',
    channel: false,
  },
};

export const PLACEHOLDERS = [
  { token: '{user}', about: 'The member name' },
  { token: '{mention}', about: 'Pings the member' },
  { token: '{server}', about: 'The server name' },
  { token: '{count}', about: 'Total member count' },
  { token: '{id}', about: 'The member ID' },
];

export const DEFAULT_TEXT = {
  welcome: 'Welcome {mention} to **{server}**! You are member #{count}.',
  farewell: '{user} has left **{server}**. Take care!',
  ban: '{user} was banned from **{server}**.',
  dm: 'Hey {user}, welcome to **{server}**! Please read the rules and enjoy your stay.',
};

export function emptyConfig(guildId) {
  const config = { guildId };
  for (const kind of KINDS) {
    config[kind] = {
      enabled: false,
      channelId: null,
      style: 'embed',
      text: DEFAULT_TEXT[kind],
      embedTitle: defaultTitle(kind),
      color: defaultColor(kind),
    };
  }
  return config;
}

function defaultTitle(kind) {
  if (kind === 'welcome') return 'Welcome!';
  if (kind === 'farewell') return 'Goodbye';
  if (kind === 'ban') return 'Member Banned';
  return 'Welcome';
}

function defaultColor(kind) {
  if (kind === 'farewell') return 0xed4245;
  if (kind === 'ban') return 0xed4245;
  return 0xffdde8;
}

export function normalizeConfig(guildId, raw) {
  const base = emptyConfig(guildId);
  if (!raw || typeof raw !== 'object') return base;

  for (const kind of KINDS) {
    const saved = raw[kind];
    if (!saved || typeof saved !== 'object') continue;
    const state = base[kind];

    state.enabled = Boolean(saved.enabled);
    state.channelId = typeof saved.channelId === 'string' ? saved.channelId : null;
    state.style = saved.style === 'text' ? 'text' : 'embed';
    state.text = clampText(saved.text, DEFAULT_TEXT[kind]);
    state.embedTitle = clampText(saved.embedTitle, defaultTitle(kind), LIMITS.embedTitle.max);
    state.color = clampColor(saved.color, defaultColor(kind));
  }

  return base;
}

function clampText(value, fallback, max = LIMITS.text.max) {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  return value.slice(0, max);
}

function clampColor(value, fallback) {
  const parsed = Number.parseInt(String(value ?? '').replace(/[^0-9]/g, ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(LIMITS.embedColor.max, Math.max(0, parsed));
}

/** Builds the substitution map for a member-scoped greeting. */
export function placeholders(member) {
  const guild = member.guild;
  const user = member.user ?? member;
  return {
    '{user}': user.username ?? user.tag ?? 'there',
    '{mention}': `<@${user.id}>`,
    '{server}': guild?.name ?? 'the server',
    '{count}': String(guild?.memberCount ?? ''),
    '{id}': String(user.id),
  };
}

export function render(text, values) {
  let output = text ?? '';
  for (const [token, value] of Object.entries(values)) {
    output = output.split(token).join(value ?? '');
  }
  return output;
}

/** Renders one greeting into the payload Discord expects. */
export function buildPayload(kind, state, values) {
  const body = render(state.text, values);
  if (state.style === 'text') {
    return { content: body, allowedMentions: { parse: ['users'] } };
  }

  const embed = {
    color: state.color,
    title: render(state.embedTitle, values),
    description: body,
  };

  if (kind === 'welcome' || kind === 'dm') {
    const avatar = values['{avatar}'];
    if (avatar) embed.thumbnail = { url: avatar };
  }

  return { embeds: [embed], allowedMentions: { parse: ['users'] } };
}

export function previewText(state, kind) {
  return render(state.text, {
    '{user}': 'NewMember',
    '{mention}': '@NewMember',
    '{server}': 'Your Server',
    '{count}': '128',
    '{id}': '123456789012345678',
    '{avatar}': 'https://cdn.discordapp.com/embed/avatars/0.png',
  });
}

export function greetingSummary(config, kind) {
  const state = config[kind];
  if (!state.enabled) return 'Off';
  if (KIND_META[kind].channel && !state.channelId) return 'On — but no channel picked yet';
  return `On — sent as ${state.style === 'text' ? 'a plain message' : 'an embed'}`;
}

export function enabledKinds(config) {
  return KINDS.filter((kind) => config[kind].enabled);
}

export function hasAnyGreeting(config) {
  return enabledKinds(config).length > 0;
}
