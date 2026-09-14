import { config } from '#config/config';
import { loadCommands } from '#handlers/commandHandler';
import { loadEvents } from '#handlers/eventHandler';
import { logger } from '#utils/logger';
import { BASE_INTENTS, FULL_INTENTS, createClient } from './client.js';

process.on('uncaughtException', (error) => {
  logger.error(`Uncaught exception: ${error.stack || error.message}`);
});
process.on('unhandledRejection', (reason) => {
  logger.error(`Unhandled rejection: ${reason instanceof Error ? reason.stack : reason}`);
});

async function prepare(intents) {
  const client = createClient(intents);
  await loadCommands(client);
  await loadEvents(client);
  return client;
}

async function login() {
  const full = await prepare(FULL_INTENTS);
  try {
    await full.login(config.token);
    return full;
  } catch (error) {
    if (!/disallowed intents/i.test(error.message ?? '')) throw error;

    logger.warn(
      'GuildMembers intent is not enabled — retrying without it. ' +
        'Enable "Server Members Intent" in the Discord Developer Portal ' +
        '(Bot → Privileged Gateway Intents) to activate join and time-based auto roles.'
    );
    full.destroy();

    const base = await prepare(BASE_INTENTS);
    await base.login(config.token);
    return base;
  }
}

async function main() {
  await login();
}

main().catch((error) => {
  logger.error(error.stack || error.message);
  process.exit(1);
});
