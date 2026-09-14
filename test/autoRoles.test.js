import assert from 'node:assert/strict';
import test from 'node:test';
import { PermissionFlagsBits } from 'discord.js';
import { createDatabase } from '../src/database/database.js';
import { createAutoRoleRepository } from '../src/database/repositories/autoRoleRepository.js';
import { createMemberRepository } from '../src/database/repositories/memberRepository.js';
import { createPanelRepository } from '../src/database/repositories/panelRepository.js';
import {
  LIMITS,
  RESET_TARGETS,
  clampInt,
  cleanIds,
  describeReset,
  emptyConfig,
  enabledFeatures,
  findUsedInvites,
  formatDays,
  hasAnyFeature,
  hasElapsed,
  normalizeConfig,
  resetFeatures,
} from '../src/services/autoRoles/logic.js';
import {
  calculateCategorySync,
  isAdministrator,
  isSafeRole,
  isStaleInteractionError,
  parseCustomId,
  tryLock,
  validatePanel,
} from '../src/services/selfRoles/logic.js';

const DAY = 24 * 60 * 60 * 1000;

function freshDb() {
  return createDatabase(':memory:');
}

test('administrator authorization requires the Administrator permission', () => {
  assert.equal(
    isAdministrator({ has: (permission) => permission === PermissionFlagsBits.Administrator }),
    true
  );
  assert.equal(isAdministrator({ has: () => false }), false);
  assert.equal(isAdministrator(undefined), false);
});

test('unsafe roles are rejected', () => {
  const botHighest = { id: 'bot-role', position: 5 };
  const safe = {
    id: '1',
    managed: false,
    position: 3,
    guild: { id: 'g' },
    permissions: { has: () => false },
  };

  assert.equal(isSafeRole(safe, botHighest), true);
  assert.equal(isSafeRole({ ...safe, managed: true }, botHighest), false);
  assert.equal(isSafeRole({ ...safe, position: 5 }, botHighest), false);
  assert.equal(
    isSafeRole(
      { ...safe, permissions: { has: (p) => p === PermissionFlagsBits.Administrator } },
      botHighest
    ),
    false
  );
  assert.equal(isSafeRole({ ...safe, id: 'g' }, botHighest), false);
});

test('validates non-empty panels and category shape', () => {
  assert.equal(validatePanel({ title: 'Roles', description: 'Choose', categories: [] }), false);
  assert.equal(
    validatePanel({
      title: 'Roles',
      description: 'Choose',
      categories: [{ id: 'games', name: 'Games', roleIds: ['1'] }],
    }),
    true
  );
});

test('sync only changes configured roles in one category', () => {
  assert.deepEqual(calculateCategorySync(['a', 'b'], ['b', 'external'], ['a']), {
    add: ['a'],
    remove: ['b'],
    unchanged: [],
  });
  assert.deepEqual(calculateCategorySync(['a'], ['a', 'other-category'], ['a']), {
    add: [],
    remove: [],
    unchanged: ['a'],
  });
});

test('only namespaced custom IDs parse', () => {
  assert.deepEqual(parseCustomId('sr:panel:games:0'), {
    type: 'panel',
    categoryId: 'games',
    page: 0,
  });
  assert.equal(parseCustomId('role:1'), null);
  assert.equal(parseCustomId('sr:panel:../../:0'), null);
});

test('an interaction lock admits only the first concurrent publish', () => {
  const locks = new Set();
  assert.equal(tryLock(locks, 'guild:user'), true);
  assert.equal(tryLock(locks, 'guild:user'), false);
  locks.delete('guild:user');
  assert.equal(tryLock(locks, 'guild:user'), true);
});

test('stale interaction errors do not attempt a second response', () => {
  assert.equal(isStaleInteractionError({ code: 10062 }), true);
  assert.equal(isStaleInteractionError({ code: 40060 }), true);
  assert.equal(isStaleInteractionError({ code: 50013 }), false);
});

test('clamps numeric thresholds into the allowed range', () => {
  assert.equal(clampInt('7', LIMITS.timedDays, 7), 7);
  assert.equal(clampInt('0', LIMITS.timedDays, 7), 1);
  assert.equal(clampInt('9999', LIMITS.timedDays, 7), 365);
  assert.equal(clampInt('abc', LIMITS.timedDays, 7), 7);
});

test('drops invalid role IDs and de-duplicates', () => {
  assert.deepEqual(cleanIds(['123456', '123456', 'x', '', null, 5]), ['123456']);
  assert.deepEqual(cleanIds('nope'), []);
});

test('normalizes partial and legacy configs to a complete shape', () => {
  const config = normalizeConfig('g1', { join: { enabled: true, roleIds: ['111111'] } });
  assert.equal(config.guildId, 'g1');
  assert.equal(config.dmNotification, true);
  assert.deepEqual(config.join.roleIds, ['111111']);
  assert.equal(config.timed.enabled, false);
  assert.equal(config.timed.days, LIMITS.timedDays.default);
  assert.deepEqual(config.activity.roleIds, []);

  assert.deepEqual(normalizeConfig('g2', null), emptyConfig('g2'));
});

test('detects which features are enabled', () => {
  const config = emptyConfig('g');
  assert.equal(hasAnyFeature(config), false);
  assert.deepEqual(enabledFeatures(config), []);

  config.join.enabled = true;
  config.activity.enabled = true;
  assert.equal(hasAnyFeature(config), true);
  assert.deepEqual(enabledFeatures(config), ['join', 'activity']);
});

test('invite attribution diffs use counts between snapshots', () => {
  const before = new Map([
    ['abc', 3],
    ['def', 0],
  ]);
  const after = new Map([
    ['abc', { code: 'abc', uses: 4, inviter: { id: 'u1' } }],
    ['def', { code: 'def', uses: 0, inviter: { id: 'u2' } }],
  ]);

  const used = findUsedInvites(before, after);
  assert.equal(used.length, 1);
  assert.equal(used[0].code, 'abc');

  const fresh = new Map([['ghi', { code: 'ghi', uses: 1, inviter: { id: 'u3' } }]]);
  assert.equal(findUsedInvites(new Map(), fresh).length, 1);
  assert.equal(findUsedInvites(new Map([['ghi', 1]]), fresh).length, 0);
});

test('elapsed membership is measured against the configured days', () => {
  const now = 10 * DAY;
  assert.equal(hasElapsed(now - 8 * DAY, 7, now), true);
  assert.equal(hasElapsed(now - 3 * DAY, 7, now), false);
  assert.equal(hasElapsed(null, 7, now), false);
});

test('formats day counts for display', () => {
  assert.equal(formatDays(1), '1 day');
  assert.equal(formatDays(7), '7 days');
});

test('reset restores only the selected settings', () => {
  const config = emptyConfig('guild');
  config.join.enabled = true;
  config.join.roleIds = ['111111'];
  config.timed.enabled = true;
  config.timed.days = 30;
  config.timed.roleIds = ['222222'];
  config.dmNotification = false;

  const reset = resetFeatures(config, ['timed']);

  assert.equal(reset.timed.enabled, false);
  assert.equal(reset.timed.days, LIMITS.timedDays.default);
  assert.deepEqual(reset.timed.roleIds, []);

  assert.equal(reset.join.enabled, true);
  assert.deepEqual(reset.join.roleIds, ['111111']);
  assert.equal(reset.dmNotification, false);
});

test('reset restores the DM notification toggle to ON', () => {
  const config = emptyConfig('guild');
  config.dmNotification = false;

  assert.equal(resetFeatures(config, ['dmNotification']).dmNotification, true);
});

test('reset leaves the original config untouched', () => {
  const config = emptyConfig('guild');
  config.invite.enabled = true;
  config.invite.roleIds = ['333333'];

  const reset = resetFeatures(config, ['invite']);

  assert.equal(config.invite.enabled, true);
  assert.deepEqual(config.invite.roleIds, ['333333']);
  assert.equal(reset.invite.enabled, false);
  assert.deepEqual(reset.invite.roleIds, []);
});

test('reset with an unknown key changes nothing', () => {
  const config = emptyConfig('guild');
  config.join.enabled = true;

  const reset = resetFeatures(config, ['not-a-feature']);
  assert.equal(reset.join.enabled, true);
});

test('describeReset reports the current state of each selected setting', () => {
  const config = emptyConfig('guild');
  config.timed.enabled = true;
  config.timed.days = 14;
  config.timed.roleIds = ['444444'];
  config.dmNotification = false;

  const lines = describeReset(config, ['timed', 'dmNotification']);

  assert.equal(lines.length, 2);
  assert.match(lines[0], /Time-based role/);
  assert.match(lines[0], /enabled/);
  assert.match(lines[0], /1 role\(s\)/);
  assert.match(lines[0], /days: 14/);
  assert.match(lines[1], /DM notification/);
  assert.match(lines[1], /back to ON/);
});

test('every reset target has a label', () => {
  for (const key of ['join', 'timed', 'invite', 'activity', 'dmNotification']) {
    assert.ok(RESET_TARGETS[key], `missing label for ${key}`);
  }
});

test('panel repository persists and reloads a panel', async () => {
  const db = freshDb();
  const panels = createPanelRepository(db);
  const panel = {
    guildId: 'guild',
    channelId: 'channel',
    messageId: 'message',
    title: 'Roles',
    description: 'Choose',
    footer: '',
    categories: [{ id: 'games', name: 'Games', description: '', roleIds: ['role'] }],
  };

  await panels.save(panel);
  assert.deepEqual(await createPanelRepository(db).get('guild'), panel);

  await panels.delete('guild');
  assert.equal(await panels.get('guild'), null);
  db.close();
});

test('auto-role repository returns defaults for unknown guilds', async () => {
  const db = freshDb();
  const configs = createAutoRoleRepository(db);

  assert.deepEqual(await configs.get('unknown'), emptyConfig('unknown'));

  const config = emptyConfig('guild');
  config.join.enabled = true;
  config.join.roleIds = ['123456'];
  await configs.save(config);

  const reloaded = await createAutoRoleRepository(db).get('guild');
  assert.equal(reloaded.join.enabled, true);
  assert.deepEqual(reloaded.join.roleIds, ['123456']);
  db.close();
});

test('member repository tracks joins and clears them on leave', async () => {
  const db = freshDb();
  const members = createMemberRepository(db);
  const joinedAt = 1_000_000;

  await members.recordJoin('guild', 'user', joinedAt);
  assert.equal(await members.getJoinTime('guild', 'user'), joinedAt);

  await members.recordJoin('guild', 'user', 9_999_999);
  assert.equal(await members.getJoinTime('guild', 'user'), joinedAt);

  assert.deepEqual(await members.listMembers('guild'), [{ userId: 'user', joinedAt }]);

  await members.removeMember('guild', 'user');
  assert.equal(await members.getJoinTime('guild', 'user'), null);
  db.close();
});

test('member repository counts activity inside a rolling window', async () => {
  const db = freshDb();
  const members = createMemberRepository(db);
  const now = 100 * DAY;

  await members.recordActivity('guild', 'user', now - 10 * DAY);
  await members.recordActivity('guild', 'user', now - 1 * DAY);
  await members.recordActivity('guild', 'user', now);

  assert.equal(await members.countActivity('guild', 'user', now - 7 * DAY), 2);

  await members.trimActivity('guild', 'user', now - 7 * DAY);
  assert.equal(await members.countActivity('guild', 'user', now - 7 * DAY), 2);
  assert.equal(await members.countActivity('guild', 'user', 0), 2);
  db.close();
});

test('invite counts accumulate per inviter and survive reload', async () => {
  const db = freshDb();
  const members = createMemberRepository(db);

  assert.equal(await members.incrementInviteCount('guild', 'inviter'), 1);
  assert.equal(await members.incrementInviteCount('guild', 'inviter'), 2);
  assert.equal(await members.incrementInviteCount('guild', 'other'), 1);

  const reloaded = createMemberRepository(db);
  assert.equal(await reloaded.incrementInviteCount('guild', 'inviter'), 3);
  db.close();
});

test('invite snapshots replace atomically and read back as a map', async () => {
  const db = freshDb();
  const members = createMemberRepository(db);

  await members.replaceInviteSnapshot('guild', [
    ['abc', 3],
    ['def', 1],
  ]);
  const snapshot = await members.getInviteSnapshot('guild');
  assert.equal(snapshot.get('abc'), 3);
  assert.equal(snapshot.get('def'), 1);

  await members.replaceInviteSnapshot('guild', [['abc', 4]]);
  const updated = await members.getInviteSnapshot('guild');
  assert.equal(updated.get('abc'), 4);
  assert.equal(updated.has('def'), false);
  db.close();
});
