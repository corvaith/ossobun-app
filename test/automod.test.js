import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ACTIONS,
  LIMITS,
  RULES,
  RULE_META,
  actionSummary,
  capsRatio,
  clampInt,
  countImages,
  emptyConfig,
  enabledRules,
  evaluate,
  hasInvite,
  hasLink,
  isIgnored,
  matches,
  normalizeConfig,
  normalizeText,
  ruleSummary,
} from '../src/services/automod/logic.js';

function message(overrides = {}) {
  return {
    content: '',
    channelId: '100',
    author: { id: '9' },
    member: { roles: { cache: new Set() } },
    attachments: new Map(),
    embeds: [],
    mentions: { users: new Map(), roles: new Map() },
    ...overrides,
  };
}

function fakeMessage(content, extras = {}) {
  const attachments = new Map();
  for (let i = 0; i < (extras.images ?? 0); i += 1) attachments.set(String(i), { name: 'a.png' });
  const users = new Map();
  const roles = new Map();
  const mentionCount = extras.mentionUsers ?? 0;
  const roleCount = extras.mentionRoles ?? 0;
  for (let i = 0; i < mentionCount; i += 1) users.set(String(i), { id: String(i) });
  for (let i = 0; i < roleCount; i += 1) roles.set(String(i), { id: String(i) });

  const { images, mentionUsers, mentionRoles, ...rest } = extras;
  void images;
  void mentionUsers;
  void mentionRoles;

  return message({ content, attachments, mentions: { users, roles }, ...rest });
}

function history(count, extras = {}) {
  const now = Date.now();
  return Array.from({ length: count }, (_, index) => ({ at: now - index * 100, ...extras }));
}

test('a fresh config has every rule present and off', () => {
  const config = emptyConfig('g1');
  assert.deepEqual(enabledRules(config), []);
  for (const rule of RULES) {
    assert.equal(config[rule].enabled, false);
    assert.deepEqual(config[rule].actions, ['delete']);
  }
});

test('normalizeConfig repairs junk without throwing', () => {
  const config = normalizeConfig('g1', {
    logChannelId: 42,
    ignoredChannelIds: ['123456', 'bad', '123456'],
    ignoredRoleIds: 'nope',
    spam: { enabled: 'yes', actions: ['nuke'], count: '9999', seconds: '0' },
    caps: { enabled: true, percent: 'abc', minLength: -5 },
    ghost: { enabled: true },
  });

  assert.equal(config.logChannelId, null);
  assert.deepEqual(config.ignoredChannelIds, ['123456']);
  assert.deepEqual(config.ignoredRoleIds, []);
  assert.equal(config.spam.enabled, true);
  assert.deepEqual(config.spam.actions, ['delete']);
  assert.equal(config.spam.count, LIMITS.spamCount.max);
  assert.equal(config.spam.seconds, LIMITS.spamSeconds.min);
  assert.equal(config.caps.percent, LIMITS.capsPercent.def);
  assert.equal(config.caps.minLength, LIMITS.capsMinLength.min);
  assert.equal(config.ghost, undefined);
});

test('clampInt keeps values inside their bounds', () => {
  assert.equal(clampInt('7', LIMITS.spamCount), 7);
  assert.equal(clampInt('999', LIMITS.spamCount), LIMITS.spamCount.max);
  assert.equal(clampInt('1', LIMITS.spamCount), LIMITS.spamCount.min);
  assert.equal(clampInt('', LIMITS.spamCount), LIMITS.spamCount.def);
});

test('link and invite detection works', () => {
  assert.equal(hasLink('go to https://example.com now'), true);
  assert.equal(hasLink('just talking'), false);
  assert.equal(hasInvite('join discord.gg/abcdef'), true);
  assert.equal(hasInvite('join discord.com/invite/abcdef'), true);
  assert.equal(hasInvite('no invite here'), false);
});

test('image counting includes attachments and embeds', () => {
  assert.equal(countImages(fakeMessage('', { images: 3 })), 3);
  assert.equal(countImages(message({ embeds: [{ image: { url: 'x' } }, { thumbnail: {} }] })), 2);
  assert.equal(countImages(message()), 0);
});

test('caps ratio ignores non-letters', () => {
  assert.equal(capsRatio('HELLO WORLD'), 100);
  assert.equal(capsRatio('hello world'), 0);
  assert.equal(capsRatio('HeLLo'), 60);
  assert.equal(capsRatio('12345'), 0);
});

test('spam rule needs the full count inside the window', () => {
  const config = emptyConfig('g1');
  config.spam.enabled = true;
  config.spam.count = 5;
  config.spam.seconds = 5;

  assert.equal(matches('spam', config, fakeMessage('hi'), history(3), Date.now()), false);
  assert.equal(matches('spam', config, fakeMessage('hi'), history(5), Date.now()), true);
});

test('spam history outside the window does not count', () => {
  const config = emptyConfig('g1');
  config.spam.enabled = true;
  config.spam.count = 3;
  config.spam.seconds = 5;

  const stale = [{ at: Date.now() - 60_000 }, { at: Date.now() - 60_000 }];
  assert.equal(matches('spam', config, fakeMessage('hi'), stale, Date.now()), false);
});

test('disabled rules never fire', () => {
  const config = emptyConfig('g1');
  const msg = fakeMessage('https://a.com https://b.com https://c.com');
  assert.equal(evaluate(config, msg, [], Date.now()), null);
});

test('image spam adds the current message to history', () => {
  const config = emptyConfig('g1');
  config.images.enabled = true;
  config.images.count = 4;
  config.images.seconds = 30;

  const past = [{ at: Date.now() - 1000, images: 3 }];
  assert.equal(matches('images', config, fakeMessage('', { images: 1 }), past, Date.now()), true);
});

test('mention spam counts users and roles together', () => {
  const config = emptyConfig('g1');
  config.mentions.enabled = true;
  config.mentions.count = 5;

  const usersOnly = fakeMessage('hey', { mentionUsers: 5 });
  assert.equal(matches('mentions', config, usersOnly, [], Date.now()), true);

  const mixed = fakeMessage('hey', { mentionUsers: 3, mentionRoles: 2 });
  assert.equal(matches('mentions', config, mixed, [], Date.now()), true);

  const below = fakeMessage('hey', { mentionUsers: 2 });
  assert.equal(matches('mentions', config, below, [], Date.now()), false);
});

test('link spam counts only messages that actually carried a link', () => {
  const config = emptyConfig('g1');
  config.links.enabled = true;
  config.links.count = 2;
  config.links.seconds = 10;

  const past = [
    { at: Date.now() - 500, link: true },
    { at: Date.now() - 600, link: false },
  ];
  assert.equal(matches('links', config, fakeMessage('https://x.com'), past, Date.now()), true);
  assert.equal(matches('links', config, fakeMessage('plain text'), past, Date.now()), false);
});

test('invite rule fires on any invite', () => {
  const config = emptyConfig('g1');
  config.invites.enabled = true;
  assert.equal(matches('invites', config, fakeMessage('discord.gg/abc'), [], Date.now()), true);
  assert.equal(matches('invites', config, fakeMessage('hello'), [], Date.now()), false);
});

test('caps rule ignores short messages', () => {
  const config = emptyConfig('g1');
  config.caps.enabled = true;
  config.caps.percent = 70;
  config.caps.minLength = 12;

  assert.equal(matches('caps', config, fakeMessage('LOUD'), [], Date.now()), false);
  assert.equal(matches('caps', config, fakeMessage('THIS IS VERY LOUD'), [], Date.now()), true);
});

test('duplicate rule normalizes whitespace and case', () => {
  const config = emptyConfig('g1');
  config.duplicates.enabled = true;
  config.duplicates.count = 3;
  config.duplicates.seconds = 60;

  const text = normalizeText('  Same   Message ');
  const past = [
    { at: Date.now() - 100, text },
    { at: Date.now() - 200, text },
  ];
  assert.equal(matches('duplicates', config, fakeMessage('same message'), past, Date.now()), true);
});

test('evaluate returns the first tripped rule', () => {
  const config = emptyConfig('g1');
  config.caps.enabled = true;
  config.caps.percent = 50;
  config.caps.minLength = 5;

  const msg = fakeMessage('THIS IS SHOUTING');
  assert.equal(evaluate(config, msg, [], Date.now()), 'caps');
});

test('ignored channels and roles are skipped', () => {
  const config = emptyConfig('g1');
  config.ignoredChannelIds = ['555'];
  config.ignoredRoleIds = ['777'];

  assert.equal(isIgnored(config, fakeMessage('hi', { channelId: '555' })), true);

  const withRole = message({
    member: { roles: { cache: new Set(['777']) } },
  });
  assert.equal(isIgnored(config, withRole), true);

  assert.equal(isIgnored(config, fakeMessage('hi', { channelId: '999' })), false);
});

test('actionSummary reads as a chain', () => {
  assert.equal(actionSummary({ actions: ['delete'] }), 'delete');
  assert.equal(actionSummary({ actions: ['delete', 'timeout'] }), 'delete then timeout');
  assert.equal(actionSummary({ actions: ['delete', 'warn', 'kick'] }), 'delete, warn then kick');
});

test('ruleSummary describes each rule in plain words', () => {
  const config = emptyConfig('g1');
  for (const rule of RULES) {
    assert.equal(ruleSummary(config, rule), 'Off');
    config[rule].enabled = true;
    const text = ruleSummary(config, rule);
    assert.ok(text.length > 0);
    assert.doesNotMatch(text, /undefined|NaN/);
  }
});

test('every rule declares a label, icon and description', () => {
  for (const rule of RULES) {
    assert.ok(RULE_META[rule].label, `${rule} has no label`);
    assert.ok(RULE_META[rule].icon, `${rule} has no icon`);
    assert.ok(RULE_META[rule].description, `${rule} has no description`);
  }
  assert.ok(ACTIONS.includes('timeout'));
});

test('a config survives a JSON round trip', () => {
  const config = emptyConfig('g1');
  config.spam.enabled = true;
  config.spam.count = 8;
  config.ignoredChannelIds = ['123456789'];

  const restored = normalizeConfig('g1', JSON.parse(JSON.stringify(config)));
  assert.equal(restored.spam.enabled, true);
  assert.equal(restored.spam.count, 8);
  assert.deepEqual(restored.ignoredChannelIds, ['123456789']);
});
