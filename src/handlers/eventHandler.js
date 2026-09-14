import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { logger } from '#utils/logger';

export async function loadEvents(client) {
  const eventsPath = path.resolve('src/events');
  const files = walk(eventsPath);

  for (const file of files) {
    const { name, execute, once } = await import(pathToFileURL(file).href);

    if (!name || !execute) {
      logger.warn(`Skipped ${file} — missing "name" or "execute" export.`);
      continue;
    }

    if (once) {
      client.once(name, (...args) => execute(...args, client));
    } else {
      client.on(name, (...args) => execute(...args, client));
    }
  }

  logger.success('Loaded all events.');
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
