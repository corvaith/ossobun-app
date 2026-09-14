import { PermissionFlagsBits } from 'discord.js';
import { startRoleCommand } from '#services/selfRoles/service';
import { CommandBuilder } from '#structures/CommandBuilder';
import { GuardError } from '#structures/guards';

export const { data, execute, meta } = new CommandBuilder()
  .setName('role')
  .setDescription('Create or maintain a self-role panel.')
  .setCategory('utility')
  .setUsage('/role setup | /role update')
  .setGuard('guild', (interaction) => {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      throw new GuardError('Administrator permission is required.');
    }
  })
  .setOptions((command) =>
    command
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
      .addSubcommand((subcommand) =>
        subcommand.setName('setup').setDescription('Create a guided self-role panel.')
      )
      .addSubcommand((subcommand) =>
        subcommand.setName('update').setDescription('Update the self-role panel.')
      )
  )
  .setHandler(startRoleCommand)
  .build();
