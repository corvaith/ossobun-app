import { EmbedBuilder } from 'discord.js';
import { config } from '#config/config';

export function successEmbed(description) {
  return new EmbedBuilder().setColor(config.colors.success).setDescription(description);
}

export function errorEmbed(description) {
  return new EmbedBuilder().setColor(config.colors.error).setDescription(`❌ ${description}`);
}

export function infoEmbed(title, description) {
  return new EmbedBuilder()
    .setColor(config.colors.info)
    .setTitle(title)
    .setDescription(description);
}
