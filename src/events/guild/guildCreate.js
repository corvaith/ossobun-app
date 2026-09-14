import { deployToGuild } from '#handlers/autoDeploy';
import { logger } from '#utils/logger';

export const name = 'guildCreate';
export const once = false;

export async function execute(guild, client) {
  logger.info(`Joined new guild: ${guild.name} (${guild.id}) — registering commands...`);
  await deployToGuild(client, guild.id);
}
