import { Client, GatewayIntentBits } from 'discord.js';

export const FULL_INTENTS = [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildVoiceStates,
  GatewayIntentBits.GuildMembers,
  GatewayIntentBits.GuildInvites,
  GatewayIntentBits.GuildMessages,
];

export const BASE_INTENTS = [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildVoiceStates,
  GatewayIntentBits.GuildInvites,
  GatewayIntentBits.GuildMessages,
];

export function createClient(intents = FULL_INTENTS) {
  return new Client({ intents });
}
