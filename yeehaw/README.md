# YeeHaw FC

Club site and Discord companion for **YeeHaw FC**, an EA FC Pro Clubs side,
served at [yeehaw-fc.club](https://yeehaw-fc.club). It rebuilds the old
Python site (`proclubs/`) in the same stack as Ravenfall HQ and shares the
droplet with it, with its own user, directory, database and port.

Next.js 15 (App Router, TypeScript), Tailwind v4 with shadcn/ui-style
components, PostgreSQL via Prisma, NextAuth with Discord.

> **Build status.** The site is being rebuilt in phases. This README marks
> what each section covers as *built* or *planned*; keep it current as
> phases land.

## What it does

- **Discord sign-in only** *(built)*. There is no registration. Site
  permissions come straight from the person's roles on the club's server,
  re-read every five minutes, so a change on Discord reaches the site without
  signing out. Which Discord role means what is set on the **Admin** page.
- **Seasons and contracts** *(schema built, screens planned)*. A season runs
  Draft → Window → Active → Ended. Every player has one contract per season:
  shirt number (1–99), squad status (Starter / Rotation / Substitute),
  primary and optional secondary position, captaincy and objectives. Shirt
  numbers are unique per season and there is at most one captain and one
  vice, enforced by partial unique indexes in the database as well as in
  validation. Management run the re-signing window (last season's players,
  terms prefilled, **Send offers** at once); a player accepts with a button
  in Discord or on their hub and is under contract immediately, with their
  squad and status roles granted. Mid-season changes and releases go
  straight from the hub; a daily job reminds management before a season
  ends, ends contracts that were not carried over, and announces the new
  squad.
- **Team showcase** *(planned)*. `/squad` shows the published first-choice
  XI on a pitch with numbers and armbands, the bench, and everyone else by
  squad status. Staff build and publish the lineup on a board from
  contracted players only. The home page shows it with the latest article,
  next fixture and recent results.
- **Player hub** *(planned)*. `/players/[slug]`: honours, stats,
  objectives progress, every contract, and the service record (milestones
  worked out from EA data, Player of the Month, commendations, warnings,
  notes), with redaction bars for what the viewer may not see.
- **Events** *(planned)*. Fixtures, scrims, training and recurring series
  announced in Discord with RSVP buttons, sign-ups by formation slot,
  reminder DMs, and a match report linking the EA matches played in the
  event's window.
- **EA stats** *(planned)*. An hourly Node script polls EA into Postgres
  (club record, matches, per-player lines, the league table); stats and
  league pages read it.
- **News** *(planned)*. Staff articles and an AI roundup every 48 hours
  (Claude Code CLI, headless, tools disabled), announced in Discord.
- **Staff tools** *(planned)*. Tactics board, set pieces, training sessions
  and suggestions, availability, the recruitment pipeline (prospects →
  contract offer), Player of the Month, club profile.

Dropped from the old site: Discord clips, Twitch live streams, coach notes,
article comments and likes, development goals and reviews.

### Permissions

| Level | From | Can |
|---|---|---|
| MANAGEMENT | Management roles, Club President or Head Coach (or `ADMIN_USER_IDS`) | everything, plus seasons, contracts, offers, releases and the Admin pages |
| STAFF | Staff roles, or Coach | the lineup, tactics, set pieces, recruitment, events, news |
| MEMBER | Member roles (any server member until one is mapped) | Training and Availability, the fuller squad view, their own hub |
| guest | not signed in, or not in the server | the public pages |

MANAGEMENT includes STAFF includes MEMBER. Every server action and route
checks on the server (`assertPerm`); hiding a link is never the control.
The old site's `DISCORD_STAFF_ROLE_ID` is just a Management role here.

### The bot

Slash commands (`/fixtures`, `/squad`) and button presses come in as signed
HTTP requests to `/api/discord/interactions`, and roles, DMs and embeds go
out over Discord's REST API. Those work on their own. Button custom ids are
`<namespace>:<action>:<id>`; each feature adds one namespace to the route.

A small second service, `yeehaw-gateway` (`scripts/gateway.mjs`, no
dependencies), holds a gateway connection. That's what makes Discord show
the bot **online**, and it passes member joins and role changes to the site
so player records follow (`/api/internal/member-sync`, authenticated with a
token derived from `NEXTAUTH_SECRET`). If it's down the bot shows offline
and records only update on sign-in or a manual sync; everything else keeps
working. The Admin overview shows its status.

## Code map

```
src/config/club.ts           club identity, squad statuses, positions, labels
src/config/formations.ts     the 20 formations and their slot coordinates
src/config/nav.ts            the navigation, with the permission each item needs
src/lib/auth.ts              NextAuth + Discord role → permission sync
src/lib/permissions.ts       the permission model
src/lib/discord.ts           Discord REST client
src/lib/discord-verify.ts    interactions signature check
src/lib/interactions.ts      helpers shared by the interactions route and its handlers
src/lib/role-config.ts       Discord role mapping (Admin page; .env fallback)
src/lib/channel-config.ts    Discord channel mapping (Admin page)
src/lib/member-sync.ts       player records kept in step with Discord
src/lib/players.ts           opening a Player row, slugs
src/lib/time.ts              club-timezone formatting
src/app/api/discord/interactions/route.ts   slash commands, buttons, modals
src/app/api/internal/*       endpoints the gateway process calls
scripts/gateway.mjs          gateway connection: bot presence + member events
src/app/*                    pages; each folder's actions.ts holds its server actions
prisma/schema.prisma         data model (every feature)
prisma/migrations/*          hand-written; the init one carries the partial unique indexes
deploy/                      systemd units, update and backup scripts
```

### Data model

`Player` is the one file per person, keyed by Discord ID. Around it:
`Season` → `Contract` (+ `ContractObjective`, `RosterMove` history);
`Event` (+ `EventSeries`, `EventSignup`, `EventLineup`, `EventTierInvite`,
`MatchRating`, `MotmVote`, `Notification`); `Lineup` / `LineupSlot`,
`TacticsBoard` / `TacticsSlot`, `SetPiece`, `TrainingSuggestion`;
`AvailabilityPattern` / `AvailabilityAway`; `ServiceEntry`, `Milestone`,
`PlayerOfTheMonth` / `PotmWinner`; `Prospect` / `ProspectNote`; `Article`;
the `Ea*` tables (snapshots, matches, per-match player lines, league clubs,
member totals, squad members and moves); and `Setting`, key/value JSON for
role and channel mapping, the club profile and bot status.

Rules Prisma can't express are raw SQL at the end of the init migration:
one live shirt number per season, one live captain and vice per season,
shirt numbers 1–99, one Window and one Active season at a time, one player
per formation slot per event. **Migrations here are written by hand**
(`prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma
--script` for the generated part) and applied with `migrate deploy`; don't
use `migrate dev`, which would drop those indexes. `npm run test` checks
they are still in the SQL.

## Local development

Needs Node 22 and a PostgreSQL database.

```bash
cd yeehaw
npm install
cp .env.example .env              # at least DATABASE_URL, NEXTAUTH_SECRET, Discord OAuth
npx prisma migrate deploy         # creates the tables
npm run dev                       # http://localhost:3000
```

For local Discord sign-in, add `http://localhost:3000/api/auth/callback/discord`
as a redirect on the Discord application and set
`NEXTAUTH_URL=http://localhost:3000`.

`npm run typecheck`, `npm run test` and `npm run build` are the checks. The
tests are fast and need no database (permissions, role config, formations,
signature verification, the migration's indexes); logic that needs the
database takes the Prisma client as an argument so it can be tested with a
stub.

---

## Discord setup

YeeHaw FC keeps the **same Discord application** the old site used: same bot
token, OAuth app and guild. Only two URLs move, at cutover.

1. **OAuth2** → Client ID and Secret as before. Replace the redirect with
   `https://yeehaw-fc.club/api/auth/callback/discord` (same host, new path).
2. **General Information** → Public Key. Set the **Interactions Endpoint
   URL** to `https://yeehaw-fc.club/api/discord/interactions` once the new
   site is running (Discord checks it as you save).
3. **Bot** → under **Privileged Gateway Intents**, turn on **Server Members
   Intent** so the bot can list members and see role changes.
4. The bot needs View Channels, Send Messages, Embed Links, Manage Roles
   (squad and status roles) and, for offers, permission to DM. In
   **Server Settings → Roles**, drag the bot's role **above** the squad,
   status and trialist roles it assigns, or Discord answers 403.
5. Sign in, open **Admin → Discord roles & channels**: pick the channels the
   bot posts to, map the roles that grant Member / Staff / Management, the
   club titles, and the roles the site gives. Then **Admin → Overview**:
   **Register commands** and **Sync players from Discord**.

For first setup put your own Discord user ID in `ADMIN_USER_IDS` so you can
reach Admin before any role is mapped, and clear it once a Management role
is saved. The `ROLE_IDS_*` values in `.env` only apply until the mapping is
first saved on the page.

---

## Deploying on the droplet (alongside Ravenfall HQ)

Mirrors Ravenfall's setup (see `ravenfall/README.md`): swap and Node 22 and
PostgreSQL as there, an OS user and database both named `yeehaw`, the repo
at `/opt/yeehaw`, the app in `/opt/yeehaw/yeehaw`, peer auth over the local
socket:

```ini
DATABASE_URL="postgresql://yeehaw@localhost/yeehaw?host=/var/run/postgresql"
```

```bash
sudo bash /opt/yeehaw/yeehaw/deploy/update.sh
```

`update.sh` installs dependencies, runs migrations, builds (with
`NODE_OPTIONS=--max-old-space-size=1536`, using swap), installs the
`yeehaw`, `yeehaw-gateway` and `yeehaw-backup` units, and (re)starts the site
on `127.0.0.1:8001`, the port Caddy already proxies yeehaw-fc.club to. The
old `yeehaw-fc.service` (gunicorn on the same port) must be stopped first;
the cutover steps, the data migration and the removal of the old app are
the last phase and will be written up here.

## Backups

`yeehaw-backup.timer` runs `deploy/backup.sh` daily: a `pg_dump` of the
`yeehaw` database to `/opt/yeehaw/backups` (newest 14 kept) and a tar of the
uploads directory (`UPLOAD_DIR`, default `/opt/yeehaw/uploads`).

```bash
sudo -u yeehaw bash /opt/yeehaw/yeehaw/deploy/backup.sh          # one now
gunzip -c /opt/yeehaw/backups/yeehaw-XXXX.sql.gz | sudo -u yeehaw psql yeehaw   # restore
```

## Troubleshooting

- **Sign-in fails**: the redirect registered on Discord must be exactly
  `https://yeehaw-fc.club/api/auth/callback/discord`, and `NEXTAUTH_URL` must
  be `https://yeehaw-fc.club` (no `www`, no trailing slash).
- **Signed in but "Access restricted"**: none of the person's roles is mapped
  to a permission on the Admin page, or they aren't in the server.
- **Bot shows offline**: `systemctl status yeehaw-gateway` and
  `journalctl -u yeehaw-gateway`.
- **Buttons say "This interaction failed"**: the interactions endpoint URL
  isn't set, or `DISCORD_PUBLIC_KEY` is wrong (every request gets a 401).
- **Build killed partway**: out of memory. Add swap.
