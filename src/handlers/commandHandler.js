import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Collection } from 'discord.js';
import { logger } from '#utils/logger';

export async function loadCommands(client) {
  client.commands = new Collection();
  const commandsPath = path.resolve('src/commands');
  const files = walk(commandsPath);

  for (const file of files) {
    const imported = await import(pathToFileURL(file).href);
    const { data, execute, meta } = imported;

    if (!data || !execute) {
      logger.warn(`Skipped ${file} — missing "data" or "execute" export.`);
      continue;
    }

    client.commands.set(data.name, { data, execute, meta });
  }

  logger.success(`Loaded ${client.commands.size} command(s).`);
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
