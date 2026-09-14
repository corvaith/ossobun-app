import { REST, Routes } from 'discord.js';
import { config } from '#config/config';
import { logger } from '#utils/logger';

async function main() {
  const rest = new REST().setToken(config.token);
  await rest.put(Routes.applicationCommands(config.clientId), { body: [] });
  logger.success('Cleared all global slash commands.');
}

main().catch((error) => {
  logger.error(error.stack || error.message);
  process.exit(1);
});
