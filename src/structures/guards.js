export class GuardError extends Error {}

const builtInGuards = {
  guild: (interaction) => {
    if (!interaction.guild) {
      throw new GuardError('This command can only be used inside a server.');
    }
  },
  owner: (interaction) => {
    if (interaction.user.id !== process.env.OWNER_ID) {
      throw new GuardError('This command is restricted to the bot owner.');
    }
  },
};

export function resolveGuard(guard) {
  if (typeof guard === 'function') return guard;
  if (builtInGuards[guard]) return builtInGuards[guard];
  throw new Error(`Unknown guard: "${guard}"`);
}
