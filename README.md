# Ossobun

A simple, self-hosted Discord bot that joins a voice channel you're already in, sits there muted & deafened, and does nothing else — used purely to hold your voice-channel presence time while you're away.

> Built by [corvaith](https://github.com/corvaith)

---

## Table of Contents

- [Features](#features)
- [Project Structure](#project-structure)
- [Commands](#commands)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Environment Variables](#environment-variables)
  - [Running the Bot](#running-the-bot)
  - [Deploying Slash Commands](#deploying-slash-commands)
- [Adding a New Command](#adding-a-new-command)
- [Guard System](#guard-system)
- [Deployment](#deployment)
- [Tech Stack](#tech-stack)
- [Troubleshooting](#troubleshooting)

---

## Features

- Slash command handler with auto-discovery (drop a file in, it's loaded)
- Fluent `CommandBuilder` API for writing clean, consistent commands
- Lightweight guard system (`guild`, custom functions — e.g. "must be in a voice channel")
- Bot only joins a voice channel you are already in — it never joins on its own
- Sits muted & deafened — zero audio processing or playback
- `/help` with full usage documentation
- Slash commands auto-register per guild on startup and the moment the bot joins a new server — instant, no waiting on global propagation
- Bot's "About Me" profile bio is set automatically on every startup

---

## Project Structure

```
src/
├── index.js                   # Entry point — loads commands, events, logs in
├── client.js                  # Creates and configures the Discord client
├── config/
│   └── config.js              # Bot-wide config (token, colors)
├── database/
│   ├── database.js            # SQLite connection and schema
│   └── repositories/          # Panel, auto-role, and member repositories
├── commands/
│   ├── voice/                 # afk, stop
│   └── utility/               # help, role, autorole
├── events/
│   ├── client/                # ready, interactionCreate
│   └── guild/                 # guildCreate, guildMemberAdd, guildMemberRemove, messageCreate
├── handlers/
│   ├── commandHandler.js      # Recursively loads commands into client.commands
│   ├── eventHandler.js        # Recursively registers event listeners
│   └── autoDeploy.js          # Instant per-guild slash command registration
├── services/
│   ├── autoRoles/             # Automatic role logic and scheduler
│   ├── selfRoles/             # Interactive self-role panel logic
│   ├── store.js               # Shared SQLite-backed stores
│   └── voice/
│       └── voiceSession.js    # Per-guild voice connection lifecycle
├── scripts/
│   └── deploy.js              # Deploys slash commands to Discord
├── structures/
│   ├── CommandBuilder.js      # Fluent builder for slash commands
│   └── guards.js              # Guard system
└── utils/
    ├── embeds.js              # Embed factory helpers
    └── logger.js              # Colored console logger
```

---

## Commands

| Command | Description |
| ------- | ----------- |
| `/afk` | Join your current voice channel (muted & deafened). Re-running it while already connected moves the bot to your new channel. |
| `/stop` | Disconnect the bot from the voice channel. |
| `/help` | Show usage documentation. |
| `/role setup` | Administrators create a guided, persistent self-role panel with role and channel selectors. |
| `/role update` | Administrators update, republish, or delete the guild's self-role panel. |
| `/autorole` | Administrators set up automatic roles: on join, after N days, at N invites, or for active members. |

---

## Auto Roles

`/autorole` opens an administrator-only menu with five options. All settings persist in `data/auto-roles.json` and survive restarts.

| # | Feature | What it does |
| - | ------- | ------------ |
| 1 | **On join** | Grants the selected roles the moment a member joins the server. |
| 2 | **Time-based** | Grants roles once a member has stayed for a configured number of days (default 7). |
| 3 | **Invite-based** | Tracks how many members joined through each member's invite links and grants roles at a configured count (default 10). |
| 4 | **Activity-based** | Grants roles when a member sends a configured number of messages (default 5) within a rolling window (default 7 days). |
| 5 | **DM notification** | DMs the member whenever they receive an auto role. Toggleable. |

The menu also has a **Reset settings** button. It asks which settings to reset (multi-select, so you can leave some untouched), shows exactly what will change, and requires a second confirmation before anything is written.

Notes:

- Time-based roles are checked by a background scheduler every 10 minutes, because Discord has no "member reached N days" event.
- Invite attribution diffs invite use counts before and after each join — Discord does not expose who invited a member directly.
- Roles that are managed, privileged, `@everyone`, or above the bot's highest role are rejected automatically.
- **On join** and **time-based** roles require the privileged **Server Members Intent**. Enable it in the Developer Portal under Bot → Privileged Gateway Intents. Without it, the bot still runs and the other features work, but those two stay dormant.
- Invite tracking also requires the **Manage Server** permission on the bot.

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v22 or higher
- A Discord bot application — create one at the [Discord Developer Portal](https://discord.com/developers/applications)

### Installation

```bash
git clone https://github.com/corvaith/ossobun.git
cd ossobun
npm install
```

### Environment Variables

Copy `.env.example` to `.env` and fill in the values:

```bash
cp .env.example .env
```

| Variable        | Required | Description |
| --------------- | -------- | ----------- |
| `DISCORD_TOKEN` | ✅ | Your bot token from the Developer Portal |
| `CLIENT_ID`     | ✅ | Application (client) ID of your bot |
| `DEV_GUILD_ID`  | — | Set during development for instant command deploys to one server |

**Required bot intents** (Developer Portal → Bot → Privileged Gateway Intents):

- **Server Members Intent** — privileged. Required for on-join and time-based auto roles. If it is off, the bot logs a warning and starts without it.
- `Guilds`, `Guild Voice States`, `Guild Invites`, and `Guild Messages` are non-privileged and always requested.

**Required bot permissions in Discord:** `Connect` in voice channels for `/afk`; `Manage Roles` for self-role panels and auto roles; `Manage Server` for invite tracking. The bot's highest role must be above every role it assigns.

### Running the Bot

```bash
# Production
npm start

# Development (auto-restarts on file changes)
npm run dev
```

### Deploying Slash Commands

Nothing to run manually — the bot registers its slash commands to every server it's in as soon as it starts, and again instantly the moment it's invited to a new server (see `guildCreate` in `src/events/guild/`). This uses **guild commands**, not global ones, to avoid the up-to-an-hour global propagation delay.

> **One-time cleanup:** if this bot previously had commands registered *globally*, those won't disappear on their own. Run this once:
> ```bash
> npm run clear-global
> ```

`npm run deploy` still exists as a manual/optional script if you ever want to force a sync without restarting the bot.

---

## Adding a New Command

1. Create a `.js` file inside the right category folder under `src/commands/` (or a new subfolder — it's picked up automatically).
2. Use `CommandBuilder`:

```js
// src/commands/utility/ping.js
import { CommandBuilder } from '#structures/CommandBuilder';
import { successEmbed } from '#utils/embeds';

export const { data, execute, meta } = new CommandBuilder()
  .setName('ping')
  .setDescription('Check bot latency.')
  .setCategory('utility')
  .setHandler(async (interaction) => {
    await interaction.reply({ embeds: [successEmbed(`Pong! ${interaction.client.ws.ping}ms`)] });
  })
  .build();
```

3. Run `npm run deploy` to register it with Discord.

---

## Guard System

Guards are pre-execution checks attached via `.setGuard()`. If a guard throws a `GuardError`, it's caught automatically and sent back as an ephemeral error message.

**Built-in guards:** `guild` (must be used inside a server), `owner` (restricted to `OWNER_ID`).

**Custom guard function** (this is how `/afk` requires you to already be in a voice channel):

```js
.setGuard('guild', (interaction) => {
  if (!interaction.member.voice.channel) {
    throw new GuardError('Join a voice channel first.');
  }
})
```

---

## Deployment

Ossobun is a standard Node.js process — anything that can run Node 22+ works.

**PM2 (recommended for VPS):**

```bash
npm install -g pm2
pm2 start src/index.js --name ossobun
pm2 save
pm2 startup
```

**Docker:**

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
CMD ["node", "src/index.js"]
```

---

## Tech Stack

| Package | Purpose |
| ------- | ------- |
| [discord.js v14](https://discord.js.org/) | Discord API wrapper |
| [@discordjs/voice](https://github.com/discordjs/discord.js/tree/main/packages/voice) | Voice connections |
| [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) | Local SQLite database |
| [dotenv](https://github.com/motdotla/dotenv) | Environment variable loading |

---

## Database

All persistent state lives in a single SQLite database at `data/ossobun.db`, created automatically on first run.

| Table | Holds |
| ----- | ----- |
| `self_role_panels` | Published self-role panel per guild |
| `auto_role_configs` | Auto-role settings per guild |
| `members` | Join timestamps used for time-based roles |
| `member_activity` | Message timestamps used for activity roles |
| `invite_snapshots` | Invite use counts for attribution |
| `voice_sessions` | Voice channel the bot is sitting in, so it can rejoin after a restart |
| `invite_stats` | Invites credited per member |

If you are upgrading from an earlier JSON-based version, migrate the old files once:

```bash
npm run migrate
```

---

## Troubleshooting

| Symptom | Fix |
| ------- | --- |
| Bot fails to join / disconnects immediately | Almost always a **network** issue: the host must allow outbound UDP to Discord's voice servers (Cloudflare-fronted, various ports incl. 443/2096/etc). Check the host's firewall/security-group rules. |
| Slash commands don't show up | Make sure the bot was invited with the `applications.commands` scope, not just `bot`. |

---

## License

MIT © [corvaith](https://github.com/corvaith)
