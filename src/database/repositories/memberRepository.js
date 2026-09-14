export function createMemberRepository(db) {
  const upsertMember = db.prepare(`
    INSERT INTO members (guild_id, user_id, joined_at)
    VALUES (?, ?, ?)
    ON CONFLICT(guild_id, user_id) DO UPDATE SET
      joined_at = COALESCE(members.joined_at, excluded.joined_at)
  `);
  const selectMember = db.prepare(
    'SELECT joined_at FROM members WHERE guild_id = ? AND user_id = ?'
  );
  const selectMembers = db.prepare('SELECT user_id, joined_at FROM members WHERE guild_id = ?');
  const deleteMember = db.prepare('DELETE FROM members WHERE guild_id = ? AND user_id = ?');

  const insertActivity = db.prepare(
    'INSERT INTO member_activity (guild_id, user_id, sent_at) VALUES (?, ?, ?)'
  );
  const countActivity = db.prepare(`
    SELECT COUNT(*) AS total FROM member_activity
    WHERE guild_id = ? AND user_id = ? AND sent_at >= ?
  `);
  const trimActivity = db.prepare(`
    DELETE FROM member_activity
    WHERE guild_id = ? AND user_id = ? AND sent_at < ?
  `);
  const deleteActivity = db.prepare(
    'DELETE FROM member_activity WHERE guild_id = ? AND user_id = ?'
  );

  const upsertInvite = db.prepare(`
    INSERT INTO invite_snapshots (guild_id, code, uses)
    VALUES (?, ?, ?)
    ON CONFLICT(guild_id, code) DO UPDATE SET uses = excluded.uses
  `);
  const selectInvites = db.prepare('SELECT code, uses FROM invite_snapshots WHERE guild_id = ?');
  const clearInvites = db.prepare('DELETE FROM invite_snapshots WHERE guild_id = ?');

  const upsertInviteStat = db.prepare(`
    INSERT INTO invite_stats (guild_id, inviter_id, count)
    VALUES (?, ?, 1)
    ON CONFLICT(guild_id, inviter_id) DO UPDATE SET count = invite_stats.count + 1
  `);
  const selectInviteStat = db.prepare(
    'SELECT count FROM invite_stats WHERE guild_id = ? AND inviter_id = ?'
  );

  const replaceInvites = db.transaction((guildId, entries) => {
    clearInvites.run(guildId);
    for (const [code, uses] of entries) upsertInvite.run(guildId, code, uses);
  });

  return {
    async recordJoin(guildId, userId, joinedAt) {
      upsertMember.run(guildId, userId, joinedAt);
    },
    async getJoinTime(guildId, userId) {
      return selectMember.get(guildId, userId)?.joined_at ?? null;
    },
    async listMembers(guildId) {
      return selectMembers.all(guildId).map((row) => ({
        userId: row.user_id,
        joinedAt: row.joined_at,
      }));
    },
    async removeMember(guildId, userId) {
      deleteMember.run(guildId, userId);
      deleteActivity.run(guildId, userId);
    },
    async recordActivity(guildId, userId, sentAt) {
      insertActivity.run(guildId, userId, sentAt);
    },
    async countActivity(guildId, userId, since) {
      return countActivity.get(guildId, userId, since).total;
    },
    async trimActivity(guildId, userId, before) {
      trimActivity.run(guildId, userId, before);
    },
    async replaceInviteSnapshot(guildId, entries) {
      replaceInvites(guildId, entries);
    },
    async getInviteSnapshot(guildId) {
      return new Map(selectInvites.all(guildId).map((row) => [row.code, row.uses]));
    },
    async incrementInviteCount(guildId, inviterId) {
      upsertInviteStat.run(guildId, inviterId);
      return selectInviteStat.get(guildId, inviterId).count;
    },
  };
}
