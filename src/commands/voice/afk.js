import {
  activeSessionChannel,
  createSession,
  hasActiveSession,
} from '#services/voice/voiceSession';
import { CommandBuilder } from '#structures/CommandBuilder';
import { GuardError } from '#structures/guards';
import { errorEmbed, successEmbed } from '#utils/embeds';

export const { data, execute, meta } = new CommandBuilder()
  .setName('afk')
  .setDescription('Join your voice channel, muted & deafened, to hold your presence time.')
  .setCategory('voice')
  .setUsage('/afk')
  .setGuard('guild', (interaction) => {
    if (!interaction.member.voice.channel) {
      throw new GuardError(
        "You need to join a voice channel first, then run `/afk` again. I only join channels you're already in."
      );
    }
  })
  .setHandler(async (interaction) => {
    const voiceChannel = interaction.member.voice.channel;
    const guildId = interaction.guild.id;
    const current = activeSessionChannel(guildId);

    if (current === voiceChannel.id) {
      await interaction.reply({
        embeds: [errorEmbed(`Already sitting in **${voiceChannel.name}**.`)],
        ephemeral: true,
      });
      return;
    }

    const moving = hasActiveSession(guildId);
    await createSession(voiceChannel);

    await interaction.reply({
      embeds: [
        successEmbed(
          moving
            ? `Moved to **${voiceChannel.name}** and is now sitting there muted & deafened.`
            : `Joined **${voiceChannel.name}** and is now sitting there muted & deafened.`
        ),
      ],
    });
  })
  .build();
