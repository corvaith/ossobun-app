import { emptyConfig, normalizeConfig } from '#services/automod/logic';

export function createAutoModRepository(db) {
  const upsert = db.prepare(`
    INSERT INTO automod_configs (guild_id, config)
    VALUES (?, ?)
    ON CONFLICT(guild_id) DO UPDATE SET config = excluded.config
  `);
  const select = db.prepare('SELECT config FROM automod_configs WHERE guild_id = ?');
  const remove = db.prepare('DELETE FROM automod_configs WHERE guild_id = ?');

  const insertCase = db.prepare(`
    INSERT INTO automod_cases (guild_id, user_id, rule, action, detail, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const countCases = db.prepare(`
    SELECT COUNT(*) AS total FROM automod_cases
    WHERE guild_id = ? AND user_id = ? AND created_at >= ?
  `);
  const recentCases = db.prepare(`
    SELECT id, rule, action, detail, created_at FROM automod_cases
    WHERE guild_id = ? AND user_id = ?
    ORDER BY created_at DESC LIMIT ?
  `);
  const clearCases = db.prepare('DELETE FROM automod_cases WHERE guild_id = ? AND user_id = ?');

  return {
    async get(guildId) {
      const row = select.get(guildId);
      return row ? normalizeConfig(guildId, JSON.parse(row.config)) : emptyConfig(guildId);
    },
    async save(config) {
      upsert.run(config.guildId, JSON.stringify(config));
    },
    async delete(guildId) {
      remove.run(guildId);
    },
    async recordCase(guildId, userId, rule, action, detail = '') {
      insertCase.run(guildId, userId, rule, action, detail, Date.now());
    },
    async countCases(guildId, userId, since) {
      return countCases.get(guildId, userId, since).total;
    },
    async recentCases(guildId, userId, limit = 10) {
      return recentCases.all(guildId, userId, limit);
    },
    async clearCases(guildId, userId) {
      clearCases.run(guildId, userId);
    },
  };
}
