import { emptyConfig, normalizeConfig } from '#services/autoRoles/logic';

export function createAutoRoleRepository(db) {
  const upsert = db.prepare(`
    INSERT INTO auto_role_configs (guild_id, config)
    VALUES (?, ?)
    ON CONFLICT(guild_id) DO UPDATE SET config = excluded.config
  `);
  const select = db.prepare('SELECT config FROM auto_role_configs WHERE guild_id = ?');
  const remove = db.prepare('DELETE FROM auto_role_configs WHERE guild_id = ?');

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
  };
}
