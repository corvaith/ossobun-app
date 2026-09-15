import { PermissionFlagsBits } from 'discord.js';
import { startAutoModCommand } from '#services/automod/service';
import { CommandBuilder } from '#structures/CommandBuilder';
import { GuardError } from '#structures/guards';

export const { data, execute, meta } = new CommandBuilder()
  .setName('automod')
  .setDescription('Set up automatic spam and rule enforcement for this server.')
  .setCategory('utility')
  .setUsage('/automod')
  .setGuard('guild', (interaction) => {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      throw new GuardError('Administrator permission is required.');
    }
  })
  .setOptions((command) => command.setDefaultMemberPermissions(PermissionFlagsBits.Administrator))
  .setHandler(startAutoModCommand)
  .build();
