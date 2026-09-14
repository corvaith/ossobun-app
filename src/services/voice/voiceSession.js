import { VoiceConnectionStatus, joinVoiceChannel } from '@discordjs/voice';
import { voiceStore } from '#services/store';
import { logger } from '#utils/logger';

const sessions = new Map();

export function hasActiveSession(guildId) {
  return sessions.has(guildId);
}

export function activeSessionChannel(guildId) {
  return sessions.get(guildId)?.channelId ?? null;
}

export async function destroySession(guildId) {
  const connection = sessions.get(guildId);
  if (connection) {
    connection.destroy();
    sessions.delete(guildId);
  }
  await voiceStore.delete(guildId);
}

export async function createSession(voiceChannel) {
  const guildId = voiceChannel.guild.id;

  const existing = sessions.get(guildId);
  if (existing) {
    existing.destroy();
    sessions.delete(guildId);
  }

  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId,
    adapterCreator: voiceChannel.guild.voiceAdapterCreator,
    selfMute: true,
    selfDeaf: true,
  });

  connection.on('error', () => {});

  connection.on(VoiceConnectionStatus.Destroyed, () => {
    sessions.delete(guildId);
  });

  sessions.set(guildId, connection);
  await voiceStore.save(guildId, voiceChannel.id);
}

export async function restoreSessions(client) {
  for (const { guildId, channelId } of await voiceStore.list()) {
    const guild = await resolveGuild(client, guildId);
    if (!guild) {
      await voiceStore.delete(guildId);
      logger.info(`[afk] Dropped session for unavailable guild ${guildId}.`);
      continue;
    }

    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel?.isVoiceBased()) {
      await voiceStore.delete(guildId);
      logger.info(`[afk] Dropped session in ${guild.name} — voice channel no longer exists.`);
      continue;
    }

    if (sessions.has(guildId)) continue;

    const connection = joinVoiceChannel({
      channelId: channel.id,
      guildId,
      adapterCreator: guild.voiceAdapterCreator,
      selfMute: true,
      selfDeaf: true,
    });

    connection.on('error', () => {});

    connection.on(VoiceConnectionStatus.Destroyed, () => {
      sessions.delete(guildId);
    });

    sessions.set(guildId, connection);
    logger.success(`[afk] Rejoined ${channel.name} in ${guild.name}.`);
  }
}

async function resolveGuild(client, guildId) {
  if (client.guilds.cache.has(guildId)) return client.guilds.cache.get(guildId);
  return client.guilds.fetch(guildId).catch(() => null);
}
