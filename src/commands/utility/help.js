import { CommandBuilder } from '#structures/CommandBuilder';
import { infoEmbed } from '#utils/embeds';

export const { data, execute, meta } = new CommandBuilder()
  .setName('help')
  .setDescription('Show documentation and usage for Ossobun.')
  .setCategory('utility')
  .setUsage('/help')
  .setHandler(async (interaction) => {
    const embed = infoEmbed(
      'Ossobun — Voice Presence Bot',
      [
        "Ossobun joins a voice channel you're already in, sits there muted & deafened, and does nothing else — it exists purely to hold your voice-channel presence time while you're away.",
        '',
        '**Commands**',
        '`/afk` — Join your current voice channel (muted & deafened). You must already be connected; the bot will never join on its own.',
        '`/stop` — Disconnect the bot from the voice channel.',
        '`/role setup` — Administrators create a guided self-role panel using Discord role/channel selectors.',
        '`/role update` — Administrators edit, republish, or delete the self-role panel.',
        '`/autorole` — Administrators set up automatic roles (join, time-based, invite-based, activity-based).',
        '`/help` — Show this message.',
      ].join('\n')
    );

    await interaction.reply({ embeds: [embed] });
  })
  .build();
