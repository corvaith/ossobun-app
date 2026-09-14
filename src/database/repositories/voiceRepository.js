export function createVoiceRepository(db) {
  const upsert = db.prepare(`
    INSERT INTO voice_sessions (guild_id, channel_id, created_at)
    VALUES (?, ?, ?)
    ON CONFLICT(guild_id) DO UPDATE SET
      channel_id = excluded.channel_id,
      created_at = excluded.created_at
  `);
  const select = db.prepare('SELECT channel_id FROM voice_sessions WHERE guild_id = ?');
  const selectAll = db.prepare(
    'SELECT guild_id, channel_id FROM voice_sessions ORDER BY created_at'
  );
  const remove = db.prepare('DELETE FROM voice_sessions WHERE guild_id = ?');

  return {
    async save(guildId, channelId) {
      upsert.run(guildId, channelId, Date.now());
    },
    async get(guildId) {
      return select.get(guildId)?.channel_id ?? null;
    },
    async list() {
      return selectAll.all().map((row) => ({ guildId: row.guild_id, channelId: row.channel_id }));
    },
    async delete(guildId) {
      remove.run(guildId);
    },
  };
}
