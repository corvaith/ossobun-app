import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS self_role_panels (
  guild_id TEXT PRIMARY KEY,
  channel_id TEXT,
  message_id TEXT,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  footer TEXT NOT NULL DEFAULT '',
  categories TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS auto_role_configs (
  guild_id TEXT PRIMARY KEY,
  config TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS members (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  joined_at INTEGER,
  PRIMARY KEY (guild_id, user_id)
);

CREATE TABLE IF NOT EXISTS member_activity (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  sent_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_member_activity_lookup
  ON member_activity (guild_id, user_id, sent_at);

CREATE TABLE IF NOT EXISTS invite_snapshots (
  guild_id TEXT NOT NULL,
  code TEXT NOT NULL,
  uses INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (guild_id, code)
);

CREATE TABLE IF NOT EXISTS invite_stats (
  guild_id TEXT NOT NULL,
  inviter_id TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (guild_id, inviter_id)
);

CREATE TABLE IF NOT EXISTS voice_sessions (
  guild_id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
`;

export function createDatabase(file = path.resolve('data/ossobun.db')) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });

  const database = new Database(file);
  database.pragma('journal_mode = WAL');
  database.pragma('foreign_keys = ON');
  database.exec(SCHEMA);

  return database;
}
