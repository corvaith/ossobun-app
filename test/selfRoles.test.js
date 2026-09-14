import assert from 'node:assert/strict';
import test from 'node:test';
import { PermissionFlagsBits } from 'discord.js';
import { createDatabase } from '../src/database/database.js';
import { createPanelRepository } from '../src/database/repositories/panelRepository.js';
import {
  calculateCategorySync,
  isAdministrator,
  isSafeRole,
  isStaleInteractionError,
  parseCustomId,
  tryLock,
  validatePanel,
} from '../src/services/selfRoles/logic.js';

test('administrator authorization requires the Administrator permission', () => {
  assert.equal(
    isAdministrator({ has: (permission) => permission === PermissionFlagsBits.Administrator }),
    true
  );
  assert.equal(isAdministrator({ has: () => false }), false);
});

test('unsafe roles are rejected', () => {
  assert.equal(
    isSafeRole(
      { id: '1', managed: false, permissions: { has: () => false }, position: 1 },
      { id: '2', position: 2 }
    ),
    true
  );
  assert.equal(
    isSafeRole(
      { id: '1', managed: true, permissions: { has: () => false }, position: 1 },
      { id: '2', position: 2 }
    ),
    false
  );
  assert.equal(
    isSafeRole(
      {
        id: '1',
        managed: false,
        permissions: { has: (p) => p === PermissionFlagsBits.Administrator },
        position: 1,
      },
      { id: '2', position: 2 }
    ),
    false
  );
  assert.equal(
    isSafeRole(
      { id: '1', managed: false, permissions: { has: () => false }, position: 2 },
      { id: '2', position: 2 }
    ),
    false
  );
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

test('an interaction lock admits only the first concurrent publish', async () => {
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

test('panel repository persists and reloads a panel', async () => {
  const db = createDatabase(':memory:');
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
  db.close();
});
