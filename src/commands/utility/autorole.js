import { PermissionFlagsBits } from 'discord.js';
import { startAutoRoleCommand } from '#services/autoRoles/service';
import { CommandBuilder } from '#structures/CommandBuilder';
import { GuardError } from '#structures/guards';

export const { data, execute, meta } = new CommandBuilder()
  .setName('autorole')
  .setDescription('Set up automatic roles for this server.')
  .setCategory('utility')
  .setUsage('/autorole')
  .setGuard('guild', (interaction) => {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      throw new GuardError('Administrator permission is required.');
    }
  })
  .setOptions((command) => command.setDefaultMemberPermissions(PermissionFlagsBits.Administrator))
  .setHandler(startAutoRoleCommand)
  .build();
