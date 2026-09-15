import { Events } from 'discord.js';
import { sendBan } from '#services/greetings/engine';
import { logger } from '#utils/logger';

export const name = Events.GuildBanAdd;
export const once = false;

export async function execute(ban, client) {
  const guild = ban.guild;
  if (!guild) return;

  await sendBan(guild, ban.user).catch((error) =>
    logger.warn(`[greetings] ban notice failed: ${error.message}`)
  );
}
