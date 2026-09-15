import { Client, GatewayIntentBits } from 'discord.js';

/**
 * Intents are requested as a ladder rather than all-or-nothing.
 *
 * Two of these are privileged and must be switched on in the Discord Developer
 * Portal (Bot -> Privileged Gateway Intents): GuildMembers and MessageContent.
 * If only one of them is enabled, a single combined request fails entirely and
 * we would silently lose every feature behind the other one. Trying progressively
 * smaller sets keeps as much working as the portal allows.
 */
const CORE = [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildVoiceStates,
  GatewayIntentBits.GuildInvites,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.GuildModeration,
];

/** Everything. Needs both privileged intents enabled. */
export const FULL_INTENTS = [
  ...CORE,
  GatewayIntentBits.GuildMembers,
  GatewayIntentBits.MessageContent,
];

/** Automod needs message content; join/leave greetings need members. */
export const NO_MEMBERS_INTENTS = [...CORE, GatewayIntentBits.MessageContent];

export const NO_CONTENT_INTENTS = [...CORE, GatewayIntentBits.GuildMembers];

/** Voice presence and slash commands only. No privileged intent needed. */
export const BASE_INTENTS = [...CORE];

export const INTENT_LADDER = [
  { name: 'full', intents: FULL_INTENTS },
  { name: 'no-members', intents: NO_MEMBERS_INTENTS },
  { name: 'no-content', intents: NO_CONTENT_INTENTS },
  { name: 'core', intents: BASE_INTENTS },
];

export function createClient(intents = FULL_INTENTS) {
  return new Client({ intents });
}
