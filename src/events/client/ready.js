import { ActivityType } from 'discord.js';
import { deployToAllGuilds } from '#handlers/autoDeploy';
import { backfillJoinTimes, startTimedRoleScheduler } from '#services/autoRoles/scheduler';
import { restoreSessions } from '#services/voice/voiceSession';
import { logger } from '#utils/logger';

const BIO =
  'Ossobun — joins your voice channel muted & deafened to hold your presence time. /afk to start, /stop to leave.';

export const name = 'ready';
export const once = true;

export async function execute(client) {
  logger.success(`Logged in as ${client.user.tag}`);
  client.user.setActivity('/afk • holding your voice time', { type: ActivityType.Listening });

  await deployToAllGuilds(client);

  await restoreSessions(client);

  startTimedRoleScheduler(client);
  await backfillJoinTimes(client);

  try {
    await client.application.fetch();
    await client.application.edit({ description: BIO });
    logger.success('Updated bot profile bio.');
  } catch (error) {
    logger.warn(`Could not update bot bio automatically: ${error.message}`);
  }
}
