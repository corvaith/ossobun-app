import { EmbedBuilder } from 'discord.js';
import { config } from '#config/config';
import { ICONS } from '#config/emojis';

export function successEmbed(description) {
  return new EmbedBuilder()
    .setColor(config.colors.success)
    .setDescription(`${ICONS.success} ${description}`);
}

export function errorEmbed(description) {
  return new EmbedBuilder()
    .setColor(config.colors.error)
    .setDescription(`${ICONS.failed} ${description}`);
}

export function warningEmbed(description) {
  return new EmbedBuilder()
    .setColor(config.colors.info)
    .setDescription(`${ICONS.warning} ${description}`);
}

export function infoEmbed(title, description) {
  return new EmbedBuilder()
    .setColor(config.colors.info)
    .setTitle(title)
    .setDescription(description);
}
