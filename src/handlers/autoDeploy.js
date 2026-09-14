import { REST, Routes } from 'discord.js';
import { config } from '#config/config';
import { logger } from '#utils/logger';

const rest = new REST().setToken(config.token);

function commandsPayload(client) {
  return [...client.commands.values()].map((command) => command.data.toJSON());
}

export async function deployToGuild(client, guildId) {
  try {
    const body = commandsPayload(client);
    await rest.put(Routes.applicationGuildCommands(config.clientId, guildId), { body });
    logger.success(`Registered ${body.length} command(s) in guild ${guildId}.`);
  } catch (error) {
    logger.error(`Failed to register commands in guild ${guildId}: ${error.message}`);
  }
}

export async function deployToAllGuilds(client) {
  const guildIds = [...client.guilds.cache.keys()];
  for (const guildId of guildIds) {
    await deployToGuild(client, guildId);
  }
  logger.success(`Command sync complete for ${guildIds.length} guild(s).`);
}
