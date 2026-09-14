import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { REST, Routes } from 'discord.js';
import { config } from '#config/config';
import { logger } from '#utils/logger';

async function main() {
  const commandsPath = path.resolve('src/commands');
  const files = walk(commandsPath);
  const commands = [];

  for (const file of files) {
    const { data } = await import(pathToFileURL(file).href);
    if (data) commands.push(data.toJSON());
  }

  const rest = new REST().setToken(config.token);

  if (config.devGuildId) {
    await rest.put(Routes.applicationGuildCommands(config.clientId, config.devGuildId), {
      body: commands,
    });
    logger.success(
      `Deployed ${commands.length} command(s) to dev guild ${config.devGuildId} (instant).`
    );
  } else {
    await rest.put(Routes.applicationCommands(config.clientId), { body: commands });
    logger.success(
      `Deployed ${commands.length} command(s) globally (may take up to 1 hour to propagate).`
    );
  }
}

function walk(dir) {
  let results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(walk(fullPath));
    } else if (entry.name.endsWith('.js')) {
      results.push(fullPath);
    }
  }
  return results;
}

main().catch((error) => {
  logger.error(error.stack || error.message);
  process.exit(1);
});
