import { config } from '#config/config';
import { loadCommands } from '#handlers/commandHandler';
import { loadEvents } from '#handlers/eventHandler';
import { logger } from '#utils/logger';
import { INTENT_LADDER, createClient } from './client.js';

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

const PORTAL_HINT =
  'Enable "Server Members Intent" and "Message Content Intent" in the Discord ' +
  'Developer Portal (Bot -> Privileged Gateway Intents).';

async function login() {
  let lastError = null;

  for (const step of INTENT_LADDER) {
    const client = await prepare(step.intents);
    try {
      await client.login(config.token);
      if (step.name !== 'full') {
        logger.warn(`Running with reduced intents (${step.name}). ${PORTAL_HINT}`);
      }
      return client;
    } catch (error) {
      if (!/disallowed intents/i.test(error.message ?? '')) throw error;
      client.destroy();
      lastError = error;
      logger.warn(`Intents "${step.name}" were rejected, stepping down.`);
    }
  }

  throw lastError ?? new Error('Could not log in with any intent set.');
}

async function main() {
  await login();
}

main().catch((error) => {
  logger.error(error.stack || error.message);
  process.exit(1);
});
