import 'dotenv/config';

export const config = {
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.CLIENT_ID,
  devGuildId: process.env.DEV_GUILD_ID || null,
  colors: {
    success: 0x57f287,
    error: 0xed4245,
    info: 0xffdde8,
  },
};
