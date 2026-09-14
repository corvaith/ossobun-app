export function createPanelRepository(db) {
  const upsert = db.prepare(`
    INSERT INTO self_role_panels (guild_id, channel_id, message_id, title, description, footer, categories)
    VALUES (@guildId, @channelId, @messageId, @title, @description, @footer, @categories)
    ON CONFLICT(guild_id) DO UPDATE SET
      channel_id = excluded.channel_id,
      message_id = excluded.message_id,
      title = excluded.title,
      description = excluded.description,
      footer = excluded.footer,
      categories = excluded.categories
  `);
  const select = db.prepare('SELECT * FROM self_role_panels WHERE guild_id = ?');
  const remove = db.prepare('DELETE FROM self_role_panels WHERE guild_id = ?');

  const toPanel = (row) =>
    row
      ? {
          guildId: row.guild_id,
          channelId: row.channel_id,
          messageId: row.message_id,
          title: row.title,
          description: row.description,
          footer: row.footer,
          categories: JSON.parse(row.categories),
        }
      : null;

  return {
    async get(guildId) {
      return toPanel(select.get(guildId));
    },
    async save(panel) {
      upsert.run({
        guildId: panel.guildId,
        channelId: panel.channelId ?? null,
        messageId: panel.messageId ?? null,
        title: panel.title,
        description: panel.description,
        footer: panel.footer ?? '',
        categories: JSON.stringify(panel.categories ?? []),
      });
    },
    async delete(guildId) {
      remove.run(guildId);
    },
  };
}
