import { PermissionFlagsBits } from 'discord.js';
import { startGreetingCommand } from '#services/greetings/service';
import { CommandBuilder } from '#structures/CommandBuilder';
import { GuardError } from '#structures/guards';

export const { data, execute, meta } = new CommandBuilder()
  .setName('greetings')
  .setDescription('Set up welcome, farewell, ban and join DM messages for this server.')
  .setCategory('utility')
  .setUsage('/greetings')
  .setGuard('guild', (interaction) => {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      throw new GuardError('Administrator permission is required.');
    }
  })
  .setOptions((command) => command.setDefaultMemberPermissions(PermissionFlagsBits.Administrator))
  .setHandler(startGreetingCommand)
  .build();
