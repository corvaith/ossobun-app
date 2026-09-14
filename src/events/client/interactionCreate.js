import { handleAutoRoleInteraction } from '#services/autoRoles/service';
import { handleSelfRoleInteraction } from '#services/selfRoles/service';
import { GuardError } from '#structures/guards';
import { errorEmbed } from '#utils/embeds';
import { logger } from '#utils/logger';

export const name = 'interactionCreate';
export const once = false;

export async function execute(interaction, client) {
  if (!interaction.isChatInputCommand()) {
    if (
      interaction.isButton() ||
      interaction.isStringSelectMenu() ||
      interaction.isRoleSelectMenu() ||
      interaction.isChannelSelectMenu() ||
      interaction.isModalSubmit()
    ) {
      if (await handleAutoRoleInteraction(interaction)) return;
      await handleSelfRoleInteraction(interaction);
    }
    return;
  }

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (error) {
    if (error instanceof GuardError) {
      await reply(interaction, errorEmbed(error.message));
      return;
    }

    logger.error(`Error executing /${interaction.commandName}: ${error.stack || error.message}`);
    await reply(interaction, errorEmbed('Something went wrong while running that command.'));
  }
}

async function reply(interaction, embed) {
  const payload = { embeds: [embed], ephemeral: true };
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(payload);
  } else {
    await interaction.reply(payload);
  }
}
