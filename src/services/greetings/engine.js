import { buildPayload, placeholders } from '#services/greetings/logic';
import { greetingStore } from '#services/store';
import { logger } from '#utils/logger';

async function send(guild, kind, member) {
  const config = await greetingStore.get(guild.id);
  const state = config[kind];
  if (!state.enabled) return false;

  const values = { ...placeholders(member), '{avatar}': member.user?.displayAvatarURL?.() ?? '' };

  if (kind === 'dm') {
    if (!member.user?.bot) {
      await member.user?.send(buildPayload(kind, state, values)).catch(() => null);
    }
    return true;
  }

  if (!state.channelId) return false;
  const channel = guild.channels.cache.get(state.channelId);
  if (!channel?.isTextBased()) {
    logger.warn(`[greetings] ${kind} channel ${state.channelId} is missing in ${guild.id}.`);
    return false;
  }

  await channel.send(buildPayload(kind, state, values)).catch((error) => {
    logger.warn(`[greetings] Could not post ${kind} in ${guild.id}: ${error.message}`);
  });
  return true;
}

export async function sendWelcome(guild, member) {
  await send(guild, 'welcome', member).catch((error) =>
    logger.warn(`[greetings] welcome failed: ${error.message}`)
  );
}

export async function sendFarewell(guild, member) {
  await send(guild, 'farewell', member).catch((error) =>
    logger.warn(`[greetings] farewell failed: ${error.message}`)
  );
}

export async function sendBan(guild, user) {
  const config = await greetingStore.get(guild.id);
  const state = config.ban;
  if (!state.enabled || !state.channelId) return;

  const channel = guild.channels.cache.get(state.channelId);
  if (!channel?.isTextBased()) return;

  const values = {
    '{user}': user.username ?? user.tag ?? 'A member',
    '{mention}': `<@${user.id}>`,
    '{server}': guild.name,
    '{count}': String(guild.memberCount ?? ''),
    '{id}': String(user.id),
  };

  await channel.send(buildPayload('ban', state, values)).catch(() => null);
}

export async function sendJoinDm(guild, member) {
  await send(guild, 'dm', member).catch((error) =>
    logger.warn(`[greetings] join dm failed: ${error.message}`)
  );
}
