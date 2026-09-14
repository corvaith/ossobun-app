import { voiceStore } from '#services/store';
import { destroySession, hasActiveSession } from '#services/voice/voiceSession';
import { CommandBuilder } from '#structures/CommandBuilder';
import { errorEmbed, successEmbed } from '#utils/embeds';

export const { data, execute, meta } = new CommandBuilder()
  .setName('stop')
  .setDescription('Disconnect the bot from the voice channel it is sitting in.')
  .setCategory('voice')
  .setUsage('/stop')
  .setGuard('guild')
  .setHandler(async (interaction) => {
    const guildId = interaction.guild.id;
    const stored = await voiceStore.get(guildId);

    if (!hasActiveSession(guildId) && !stored) {
      await interaction.reply({
        embeds: [errorEmbed('Not currently sitting in a voice channel.')],
        ephemeral: true,
      });
      return;
    }

    await destroySession(guildId);

    await interaction.reply({
      embeds: [successEmbed('Left the voice channel.')],
    });
  })
  .build();
