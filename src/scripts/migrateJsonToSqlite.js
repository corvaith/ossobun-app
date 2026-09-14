import fs from 'node:fs';
import path from 'node:path';
import { autoRoleStore, memberStore, panelStore } from '#services/store';
import { logger } from '#utils/logger';

const LEGACY_FILES = {
  panels: path.resolve('data/self-role-panels.json'),
  autoRoles: path.resolve('data/auto-roles.json'),
  tracking: path.resolve('data/auto-role-tracking.json'),
};

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

async function migrate() {
  let migrated = 0;

  const panels = readJson(LEGACY_FILES.panels);
  if (panels) {
    for (const panel of Object.values(panels)) {
      await panelStore.save(panel);
      migrated++;
    }
  }

  const autoRoles = readJson(LEGACY_FILES.autoRoles);
  if (autoRoles) {
    for (const config of Object.values(autoRoles)) {
      await autoRoleStore.save(config);
      migrated++;
    }
  }

  const tracking = readJson(LEGACY_FILES.tracking);
  if (tracking) {
    for (const [guildId, data] of Object.entries(tracking)) {
      for (const [userId, entry] of Object.entries(data.members ?? {})) {
        await memberStore.recordJoin(guildId, userId, entry.joinedAt ?? null);
        for (const sentAt of entry.activity ?? []) {
          await memberStore.recordActivity(guildId, userId, sentAt);
        }
        migrated++;
      }
      for (const [inviterId, count] of Object.entries(data.inviteStats ?? {})) {
        for (let i = 0; i < count; i++) {
          await memberStore.incrementInviteCount(guildId, inviterId);
        }
      }
      await memberStore.replaceInviteSnapshot(
        guildId,
        Object.entries(data.invites ?? {}).map(([code, uses]) => [code, uses])
      );
    }
  }

  if (migrated) logger.success(`Migrated ${migrated} legacy record(s) into SQLite.`);
  return migrated;
}

const shouldRun = process.argv.includes('--run');

if (shouldRun) {
  migrate()
    .then(() => process.exit(0))
    .catch((error) => {
      logger.error(error.stack || error.message);
      process.exit(1);
    });
}

export { migrate };
