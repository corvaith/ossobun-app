import assert from 'node:assert/strict';
import test from 'node:test';
import { createDatabase } from '../src/database/database.js';
import { createVoiceRepository } from '../src/database/repositories/voiceRepository.js';

function freshDb() {
  return createDatabase(':memory:');
}

test('voice repository stores one session per guild', async () => {
  const db = freshDb();
  const voices = createVoiceRepository(db);

  assert.equal(await voices.get('guild'), null);

  await voices.save('guild', 'channel-1');
  assert.equal(await voices.get('guild'), 'channel-1');

  await voices.save('guild', 'channel-2');
  assert.equal(await voices.get('guild'), 'channel-2');

  assert.deepEqual(await voices.list(), [{ guildId: 'guild', channelId: 'channel-2' }]);
  db.close();
});

test('voice repository tracks several guilds independently', async () => {
  const db = freshDb();
  const voices = createVoiceRepository(db);

  await voices.save('guild-a', 'channel-a');
  await voices.save('guild-b', 'channel-b');

  const sessions = await voices.list();
  assert.equal(sessions.length, 2);
  assert.equal(await voices.get('guild-a'), 'channel-a');
  assert.equal(await voices.get('guild-b'), 'channel-b');
  db.close();
});

test('deleting a voice session clears it and leaves others alone', async () => {
  const db = freshDb();
  const voices = createVoiceRepository(db);

  await voices.save('guild-a', 'channel-a');
  await voices.save('guild-b', 'channel-b');

  await voices.delete('guild-a');

  assert.equal(await voices.get('guild-a'), null);
  assert.equal(await voices.get('guild-b'), 'channel-b');
  assert.equal((await voices.list()).length, 1);
  db.close();
});

test('voice sessions survive a fresh repository over the same database', async () => {
  const db = freshDb();
  await createVoiceRepository(db).save('guild', 'channel');

  assert.equal(await createVoiceRepository(db).get('guild'), 'channel');
  db.close();
});
