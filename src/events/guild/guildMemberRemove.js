import { Events } from 'discord.js';
import { memberStore } from '#services/store';
import { logger } from '#utils/logger';

export const name = Events.GuildMemberRemove;
export const once = false;

export async function execute(member, client) {
  const joinedAt = await memberStore.getJoinTime(member.guild.id, member.id);
  if (joinedAt === null) return;

  await memberStore.removeMember(member.guild.id, member.id);
  logger.info(`[tracking] Removed ${member.user.tag} from ${member.guild.name}.`);
}
