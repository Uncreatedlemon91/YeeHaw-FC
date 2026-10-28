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
- **Seasons and contracts** *(built)*. A season runs
  Draft → Window → Active → Ended (Admin → Seasons & contracts: create, edit,
  move along, see every contract). Every player has one contract per season:
  shirt number (1–99), squad status (Starter / Rotation / Substitute),
  primary and optional secondary position, captaincy and objectives. Shirt
  numbers are unique per season and there is at most one captain and one
  vice, enforced by partial unique indexes in the database as well as in
  validation (the message names who has the number).
  **The re-signing window** (`/admin/seasons/[id]/window`) lists last season's
  players with their terms prefilled; management edit, untick to let someone
  go, add other members, and **Send offers** posts them all at once (or none,
  if any row breaks a rule). Each offer is DMed to the player with
  **Accept / Decline** buttons (posted in the roster channel with a mention
  if their DMs are closed); only the player it names can press them, and
  they can answer on their hub too. Accepting makes the contract Active
  immediately, with no staff confirmation, and grants the squad and status
  roles in Discord (`src/lib/role-sync.ts`, a port of `role_sync.py`: it only
  ever adds or removes the roles mapped on the Admin page, and a role problem
  never undoes the acceptance, it's shown on the contract). Mid-season
  changes (number, status, positions, captaincy, objectives) go straight from
  the hub's **Manage** tab and the player is DMed what changed; **Release**
  ends the contract, removes the roles and posts a departure.
  **The daily season job** (`scripts/season-job.ts`, `yeehaw-season-job.timer`)
  opens a Draft season's window on its date, reminds management 7 days
  before a season ends, at the end turns Active contracts into Ended (and
  lapses unanswered offers) and removes squad roles from anyone without a
  contract in the next season, and starts a Window season on its start date
  with a squad announcement. Every step is once-only, so running it twice or
  by hand (`npm run season:job`) is harmless.
- **Team showcase** *(built)*. `/squad` (public) shows the published
  first-choice XI on a pitch with shirt numbers, captain / vice armbands and
  avatars (each a link to the player's hub), the armband holders, the bench,
  and everyone else under contract by squad status, with a link on to
  `/players`. The home page shows the same pitch beside the next fixture,
  recent results and the latest article. Numbers and armbands are read from
  today's contracts, not stored on the lineup, so a mid-season change shows
  at once; a player released since publishing leaves an empty slot.
  **The lineup editor** (`/staff/lineup`, staff) picks a formation and places
  contracted players on the pitch and the seven bench slots: tap a name then a
  slot (phone friendly), or drag; tap a placed player to move or swap them.
  *Save draft* keeps work in progress; *Publish* needs all eleven pitch slots
  and writes a new Published lineup (older ones stay as history, the site
  shows the newest). Only players with a live contract can be picked, one
  player per slot, slot keys must belong to the formation: checked on the
  server (`src/lib/lineup-rules.ts`), not just in the browser.
- **Tactics board and set pieces** *(built)*. `/staff/tactics` is the same
  board component as the lineup editor (port of `tactics.html` / `tactics.js`):
  staff place names on a formation, each formation remembers its own slots,
  Save replaces the one you're on and makes it the active shape. Roster =
  the people under contract plus free-text names (EA gamertags with no file
  show up as suggestions). Members see the board read-only. `/staff/set-pieces`
  is the routine book by kind (corner, free kick, penalty, throw-in,
  kick-off): name, side, taker, routine, targets; members read, staff write.
  `tacticsRoles()` is the port of `tactics_roles_for` (the position someone
  holds on the active formation).
- **Player self-service** *(built)*. On their own hub a player can edit their
  bio (500 characters), preferred foot and build (40 characters); the action
  never takes a player id, it only ever writes the signed-in person's file.
- **Player hub** *(built)*. `/players` lists staff, the squad by status and
  alumni; `/players/[slug]` is a player's file: a card (number, positions,
  status, armband, ribbon rack, headline stats) and tabs Overview (stats from
  recorded EA matches, objectives against them), Contracts (every season),
  Service record and Attendance & availability. Clearance is applied on the
  server before anything is sent: the public sees the card, overview stats,
  a contract summary and the public part of the service record; the player and
  staff also see terms and objectives, contract and squad moves, warnings and
  attendance; staff see notes (not on their own file). What a viewer may not
  see is drawn as a redaction bar, except warnings and notes, which are
  simply absent so nobody can tell one exists.
  The **service record** (`src/lib/service-record.ts`, port of
  `service_record.py`) merges milestones worked out from the player's matches
  (debut, 25/50/100/200/300 appearances, first goal and goal / assist steps,
  hat-tricks, Man of the Match, clean sheets, personal best), roster moves,
  EA squad changes, Player of the Month and staff entries (commendation,
  warning, note). Management get a **Manage** tab: offer, change terms,
  release, withdraw an offer, link a gamertag.
- **Events** *(built)*. `/fixtures` (public) lists upcoming events with
  going / maybe counts, your own answer and recent results, or shows them on a
  month calendar (`?view=calendar`). Staff schedule events (`/fixtures/new`):
  match, scrim, tournament, community night, training or theory session, each
  with a length (that window is what EA matches are linked to for the report)
  and an optional formation. `/fixtures/[id]` is the event page: answer going /
  maybe / can't make it (and up to three preferred positions), or, when the
  event has a formation, **sign up by position** on the same pitch and bench
  as the lineup (tap an open position to take it, yours to give it up; taking
  a position *is* signing up, Maybe or Out gives it up, one player per
  position enforced by a partial unique index; `src/lib/event-rules.ts`,
  port of `claim_slot` / `set_signup`). Sign-ups stop when the event is over
  or staff close them. Staff also see who under contract hasn't answered
  (with whether it's one of their usual nights), mark **attendance** once it
  has started (present / absent / excused; excused isn't held against
  reliability), edit the **team sheet** on the shared board from the squad
  and sign-ups (publishing posts it in Discord and DMs each player their
  position once), and edit a training session's **plan** (objective, plan, a
  brief per position, afterwards a review). The match report card is the EA
  matches linked to the event plus the vote and ratings (below).
  **Recurring series** (`/fixtures/series`): weekdays + a wall-clock time in
  the club timezone; occurrences are ordinary events generated four weeks
  ahead by the hourly notify job, at the same local time across clock
  changes (`src/lib/recurrence.ts`). Editing a series rewrites its upcoming
  nights (a night somebody has answered is never deleted: if it no longer
  fits it stays as a one-off), a series can be paused or deleted, and it can
  announce each night in Discord a set number of days ahead.
  **The announcement** is an embed with RSVP controls (buttons, or a position
  picker plus Maybe / Can't make it for an event with a formation) posted in
  the events channel from the Admin page; pressing a control, or answering
  on the site, updates the same roster and rewrites the post. The `rsvp:`
  buttons need the clicker to be a club member. Staged tier invites (the old
  private-thread ladder) were not ported.
- **Training** *(built)*. `/training` (members): upcoming sessions with their
  objective, recent ones with the review, and the suggestion box (a member
  suggests what to work on; staff and that member see it; staff reply with a
  status and a note). A session is an event of type Training or Theory, so it
  has everything above; the plan is edited on its event page.
- **Availability** *(built)*. `/availability` (members): the squad night by
  night for two weeks (a fixture's own answer overrides the usual night; being
  away overrides both), your usual nights and your away dates. Each player
  only ever writes their own. Shown on the hub's Attendance tab and on each
  event for staff. On Mondays the notify job DMs contracted players who have
  never set their usual nights.
- **Recruitment** *(built)*. `/staff/recruitment` (staff; port of
  `recruitment.py`): files move Prospect, On trial, Offered, Signed (or Not
  for us). Staff move files between Prospect, On trial and Not for us; Offered
  and Signed follow the contract, so **Offer contract** (management; the same
  `offerContracts` as the hub) moves the file to Offered, and the player
  accepting moves it to Signed (accepting needs no staff confirmation here).
  Trial notes (rating 1 to 10, optionally from a match) are copied to the
  recruitment channel, and a note from a match puts a prospect on trial. New
  arrivals in the server (joined in 30 days, no file, contract or title) can be
  started as a file or dismissed. Signed prospects get the settling-in
  checklist (contract, gamertag and usual nights are read from the data;
  invited to the EA club and welcome message are ticked, the latter by the
  DM button). The Trialist role follows On trial and Offered.
- **EA stats** *(built)*. An hourly Node script (`scripts/ea-poll.ts`,
  `yeehaw-ea-poll.timer`) polls EA's unofficial Pro Clubs API into Postgres:
  the club's record and skill rating each hour (`EaClubSnapshot`), every match
  (league and playoff, not friendlies) with each player's line (`EaMatch`,
  `EaMatchPlayer`), EA's own season totals per member (`EaMemberTotal`), who
  joined or left the EA club (`EaSquadMember` / `EaSquadMove`; the first poll is
  only a baseline) and the league table's clubs. Port of `proclubs/ea_client.py`,
  `poll.py` and `db.py`. EA only keeps a rolling window of recent matches, so every
  poll copies what it sees; a match already stored (match id + club) is skipped, so
  polling twice is harmless. Lines carry the position **lowercase** as EA sends it
  (`goalkeeper`, `defender`: clean sheets are credited by position) and are pointed
  at the `Player` whose gamertag they carry, re-checked every poll for gamertags
  linked later. Matches played inside a match-type event's window (30 minutes
  before kick-off to 30 minutes after its end) get `EaMatch.eventId`, which is what
  fills the event's match report.
  **`/club/stats`** (public) has Overview (EA's record, skill rating over time,
  goal difference per match, form, Player of the Month), Players (EA's own totals
  where the poll has them, recorded lines otherwise), Matches and Competition
  (head to head); the charts are inline SVG drawn on the server
  (`src/components/charts.tsx`), no chart library. **`/club/league`** (public) is
  the auto-built table: the clubs we have actually played (capped at
  `EA_LEAGUE_MAX_TEAMS`, the lowest rated making room for a new opponent, our own
  club never evicted), kept to our tier and ranked by skill rating. The site shows no
  division, on purpose: EA exposes no live one, and its all-time leaderboard
  tier is only used to bucket comparable opponents.
  **A new game title means a new EA club id**: `npm run ea:season -- find`
  searches EA for the club, `switch [--club-id N]` archives the old club's Ea* data
  (gzipped JSON in `BACKUP_DIR`), erases it and rewrites `EA_CLUB_ID` in `.env`,
  `reset` erases only. Seasons, contracts, events, articles, honors, milestones
  and gamertags are not the game's and stay.
- **Match report** *(built)*. On a match-type event page: the result as EA
  recorded it (the linked matches added up, goal difference, scorers), every
  match's player lines with EA ratings, top rated, and the club's own **Man of the
  Match vote** and **self ratings**. The vote opens two hours after kick-off (the
  hourly notify job's `votes` step, or staff sooner), is posted in the events
  channel with two pickers (`motm:vote:<event>`, `motm:rate:<event>`), closes 48
  hours later or when the report is published. Only players who were in the squad
  (the published team sheet, else those who signed up as going) can vote, not for
  themselves, and may change it until it closes; the winner stays secret until
  then. Staff write the key moments and clips, give **coach ratings** (each player
  sees only their own, with the comment) and **publish**, which closes the vote and
  posts the report. Port of `matchweek.py` / `matchweek_routes.py`.
- **Milestones and Player of the Month** *(built)*. After each poll
  (`src/lib/recognition.ts`, port of `recognition.py`) players are checked against
  the milestone list (debut, 10/25/50/100/200 appearances, goals, assists, clean
  sheets, squad Man of the Match awards; keys like `apps-25` that the hub's
  ribbons read), each awarded once and announced once in the recognition channel
  (falling back to events). The first evaluation ever records what players already
  reached as announced: history isn't news. Once a month is over (club time) the
  Player of the Month is the most Man of the Match votes in that month's matches;
  level on votes, more match wins; still level, they share it (one `PotmWinner`
  row each). The hub shows it as a ribbon and a service-record honor.
- **News** *(built)*. `/news` (public; staff also see drafts) lists articles by
  category; `/news/[slug]` shows one. Staff write them at `/news/new` in
  **Markdown** (raw HTML is shown as text, never run), with an optional cover
  image: PNG, JPEG or WebP up to 6 MB, type checked by its bytes, re-encoded to
  WebP at two sizes with EXIF dropped (`sharp`, which ships with Next), stored under
  `UPLOAD_DIR/articles` and served by `/api/uploads/articles/<file>`. Publishing
  announces the article in the news channel on Discord once (editing a live one
  doesn't re-announce); unpublish, edit and delete are on the article. Articles in
  HTML (the AI roundup, and any carried over from the old site) are sanitised to a
  short tag list when written **and** when shown (`src/lib/html-sanitize.ts`).
  The home page shows the latest.
- **The AI roundup** *(built)*. Every `ROUNDUP_DAYS` (2) days an article is written
  from the period's facts: results, per-player totals, skill rating and division
  movement, league position, and the roster's signings, appointments and
  departures. Port of `proclubs/weekly_article.py`; see "The AI roundup" below.
- **Staff tools** *(planned)*. The club profile.

Dropped from the old site: Discord clips, Twitch live streams, coach notes,
article comments and likes, development goals and reviews.

### Permissions

| Level | From | Can |
|---|---|---|
| MANAGEMENT | Management roles, Club President or Head Coach (or `ADMIN_USER_IDS`) | everything, plus seasons, contracts, offers, releases and the Admin pages |
| STAFF | Staff roles, or Coach | the lineup, tactics and set pieces (edit), recruitment, events and series, attendance, team sheets, training plans, news |
| MEMBER | Member roles (any server member until one is mapped) | sign up for events, Training and Availability, read Tactics and Set pieces, the fuller squad view, their own hub |
| guest | not signed in, or not in the server | the public pages (including Fixtures and who has signed up) |

MANAGEMENT includes STAFF includes MEMBER. Every server action and route
checks on the server (`assertPerm`); hiding a link is never the control.
The old site's `DISCORD_STAFF_ROLE_ID` is just a Management role here.

### The bot

Slash commands (`/fixtures`, `/squad`) and button presses (`ct:` contract
offers, `rsvp:` event sign-ups, `motm:` the Man of the Match and self-rating pickers) come in as signed
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
src/lib/contract-rules.ts    contract terms: parsing, number / captaincy conflicts, who may answer an offer (pure)
src/lib/contracts.ts         offer, accept / decline, change, release, withdraw (+ Discord side effects)
src/lib/contract-messages.ts offer / squad announcement / departure embeds and buttons
src/lib/contract-interactions.ts   the "ct:" Accept / Decline buttons
src/lib/role-sync.ts         squad / status / trialist roles kept in step with contracts
src/lib/season-rules.ts      season transitions and what the daily job has due (pure)
src/lib/seasons.ts           season CRUD, transitions, ending, announcements
src/lib/season-job.ts        the daily job's loop
src/lib/lineup-rules.ts      team-sheet rules: slots, one place each, contracted only, moving players (pure)
src/lib/lineups.ts           lineup editor: draft / publish
src/lib/squad.ts             the live squad and the published XI
src/lib/tactics.ts           tactics board persistence, tacticsRoles()
src/lib/recurrence.ts        recurring series: occurrences, generation range, editing plan (pure, DST-safe)
src/lib/event-rules.ts       event / series forms, sign-up rules, reminder targeting (pure)
src/lib/event-messages.ts    the RSVP announcement, team sheet, reminder DM (pure builders)
src/lib/events.ts            events: create / edit / delete, sign-ups, attendance, announce, team sheet
src/lib/event-series.ts      series: create / edit / pause / delete, generate ahead, announce due
src/lib/event-interactions.ts   the "rsvp:" buttons and position picker
src/lib/event-page.ts        what the event page shows, with each viewer's clearance applied
src/lib/notify-job.ts        the hourly notify job's steps
src/lib/availability-rules.ts   day state, away dates, the grid, ISO week (pure)
src/lib/availability.ts      usual nights, away, the grid and who is away
src/lib/training-rules.ts    session plan / review / suggestion rules (pure)
src/lib/training.ts          sessions, plans, reviews, suggestions
src/lib/recruitment-rules.ts stage moves, forms, onboarding, new arrivals, notes (pure)
src/lib/recruitment-stages.ts   Offered / Signed following the contract (called by contracts.ts)
src/lib/recruitment.ts       the pipeline: files, notes, arrivals, offer, settling in
src/lib/set-piece-rules.ts   set-piece form rules (pure)
src/components/pitch.tsx     pitch, bench and player token (drawing only)
src/components/board-editor.tsx  the editable board shared by lineup and tactics
src/lib/service-record.ts    milestones, timeline, who sees what (pure)
src/lib/player-stats.ts      totals, attendance reliability, objective progress (pure)
src/lib/player-hub.ts        loads a hub with clearance applied
src/lib/ea-client.ts         EA's unofficial API: headers, spacing, retries, optional curl-impersonate
src/lib/ea-rules.ts          parsing EA's matches / member totals, squad diff, league roster, match-to-event linking (pure)
src/lib/ea-poll.ts           the poll's writers: snapshots, matches, squad, totals, league roster, relinking
src/lib/ea-job.ts            the hourly EA job's steps (poll, link, milestones, Player of the Month)
src/lib/ea-season.ts         a new EA club id: find, archive, erase, rewrite .env (scripts/ea-season.ts)
src/lib/stats-rules.ts       form, record, head to head, player totals (pure)
src/lib/club-stats.ts        what /club/stats and /club/league read
src/lib/recognition-rules.ts milestones, the vote, Player of the Month ties, their embeds (pure)
src/lib/recognition.ts       evaluating and announcing milestones, awarding the month
src/lib/match-report-rules.ts   a night's summary, scorers, top rated, vote and report messages (pure)
src/lib/match-report.ts      the vote, self and coach ratings, publishing, loading the report
src/lib/motm-interactions.ts the "motm:" pickers
src/lib/news-rules.ts        article form, slugs, the announcement embed (pure)
src/lib/news.ts              articles: create / edit / delete, announce, list
src/lib/news-images.ts       cover upload (bytes checked, WebP at two sizes) and the file paths
src/lib/html-sanitize.ts     the HTML allow-list for the AI roundup and carried-over articles
src/lib/article-rules.ts     the roundup: when it is due, the prompt, the CLI arguments, reading the answer (pure)
src/lib/article-job.ts       the roundup: gather facts, run the CLI with no tools, publish
src/components/charts.tsx    inline SVG charts for the stats page
src/lib/time.ts              club-timezone formatting
src/app/api/discord/interactions/route.ts   slash commands, buttons, modals
src/app/api/internal/*       endpoints the gateway process calls
scripts/gateway.mjs          gateway connection: bot presence + member events
scripts/season-job.ts        the daily season job (npm run season:job)
scripts/notify-job.ts        the hourly notify job (npm run notify:job)
scripts/ea-poll.ts           the hourly EA poll (npm run ea:poll)
scripts/ea-season.ts         switch to a new EA club id (npm run ea:season)
scripts/article-job.ts       the AI roundup (npm run article:job)
src/app/*                    pages; each folder's actions.ts holds its server actions
prisma/schema.prisma         data model (every feature)
prisma/migrations/*          hand-written; the init one carries the partial unique indexes
deploy/                      systemd units, update and backup scripts
```

### Data model

`Player` is the one file per person, keyed by Discord ID. Around it:
`Season` → `Contract` (+ `ContractObjective`, `RosterMove` history);
`Event` (+ `EventSeries`, `EventSignup`, `EventLineup`, `EventTierInvite` (unused so far),
`MatchRating`, `MotmVote`, `Notification`); `Lineup` / `LineupSlot`,
`TacticsBoard` / `TacticsSlot`, `SetPiece`, `TrainingSuggestion`;
`AvailabilityPattern` / `AvailabilityAway`; `ServiceEntry`, `Milestone`,
`PlayerOfTheMonth` / `PotmWinner`; `Prospect` / `ProspectNote`; `Article`;
the `Ea*` tables (snapshots, matches, per-match player lines, league clubs,
member totals, squad members and moves; `EaMatch.eventId` links a match to its
event, `EaMatchPlayer.playerId` a line to its player); and `Setting`, key/value JSON for
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
signature verification, the migration's indexes, contract and season rules, role sync, the service record's visibility, lineup and set-piece rules, recurring series across clock changes, sign-up rules, reminder targeting, availability, training and recruitment stage rules, EA parsing against sample payloads, the league roster, linking matches to events, milestones, the vote and Player of the Month ties, the article job's off-day skipping, prompt and answer reading, HTML sanitising); logic that needs the
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
`yeehaw`, `yeehaw-gateway`, `yeehaw-backup`, `yeehaw-season-job`,
`yeehaw-notify`, `yeehaw-ea-poll` and `yeehaw-article` units (all but the
first two on timers), and (re)starts the site
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

## The daily season job

`yeehaw-season-job.timer` runs `scripts/season-job.ts` once a day (09:20 UTC,
`Persistent=true`, so a missed day catches up). It needs the same `.env` as the
site and the bot's Manage Roles permission. Run it now with
`sudo systemctl start yeehaw-season-job`, read the result with
`journalctl -u yeehaw-season-job`.

## The hourly notify job

`yeehaw-notify.timer` runs `scripts/notify-job.ts` every hour
(`Persistent=true`). It needs the same `.env` as the site and the bot token.
Five steps, each failing on its own: keep every recurring series generated
four weeks ahead; post the RSVP announcement for series that announce N days
ahead; DM contracted players who haven't answered an event starting within 24
hours (not those away that day); open the Man of the Match vote two hours after
a match kicks off and post it; and, on Mondays from 10:00 club time, DM
contracted players who never set their usual nights. Every DM is recorded in
`Notification` (once per event and player, or per player per ISO week), so
running it twice, or every hour, sends each once, and a closed inbox isn't
retried. Run it now with `sudo systemctl start yeehaw-notify`, read the result
with `journalctl -u yeehaw-notify`.

## The hourly EA poll

`yeehaw-ea-poll.timer` runs `scripts/ea-poll.ts` every hour (`Persistent=true`,
two minutes of jitter). It needs the same `.env` as the site, with `EA_CLUB_ID`
(and `EA_PLATFORM`, `EA_CLUB_NAME`). Steps, each failing on its own: **clubs**
(ours first with its squad tracked, then every club in the league table's roster),
**players** (lines stored before a gamertag was linked get their player),
**events** (matches linked to the event they were played in), **milestones** and
**potm**. A warning (EA slow or down for one endpoint) is normal for an unofficial
API and not a failed run; a step that crashes exits non-zero. Run it now with
`sudo systemctl start yeehaw-ea-poll`, read the result with
`journalctl -u yeehaw-ea-poll`.

EA's edge (Akamai Bot Manager) fingerprints the TLS handshake and answers plain
scripted requests with a 403 that a browser doesn't get. The old site used
`curl_cffi` to look like Chrome; Node's `fetch` can't. The poll sends a browser's
headers, spaces its requests 400 ms apart and retries 429 / 5xx up to three times
(honouring `Retry-After`), but **if the journal shows `HTTP 403`**, install a
[curl-impersonate](https://github.com/lexiforest/curl-impersonate) build and set
`EA_CURL_BIN` in `.env` to its binary (for example `/usr/local/bin/curl_chrome124`);
the poll then uses it for every request.

**New game title, new club id.** EA issues a new club id every title.
As the `yeehaw` user in `/opt/yeehaw/yeehaw`:

```bash
npm run ea:season -- find                       # search EA for EA_CLUB_NAME
npm run ea:season -- switch                     # the one exact match, or:
npm run ea:season -- switch --club-id 1234567   # name it outright
sudo systemctl restart yeehaw && sudo systemctl start yeehaw-ea-poll
```

`switch` archives everything in the Ea* tables to `BACKUP_DIR` (gzipped JSON; EA
can't give old matches back), erases it and sets `EA_CLUB_ID` / `EA_PLATFORM` in
`.env`. `reset` erases without switching; `--no-archive` deletes outright.

## The AI roundup

`yeehaw-article.timer` fires every morning at 09:15 US Eastern (follows EST/EDT,
`Persistent=true`, five minutes of jitter) and `scripts/article-job.ts` skips the
days between roundups (`ROUNDUP_DAYS`, default 2), which keeps the rhythm through
month ends and downtime where a calendar rule wouldn't. It gathers the last
`ROUNDUP_DAYS` days (results, player totals, skill rating and division, league
position, signings, appointments and departures from the roster moves), runs the
Claude Code CLI in headless mode with **every tool disabled** (`-p --tools ""
--strict-mcp-config --no-session-persistence`, from an empty scratch directory, with
only `PATH`, `HOME` and the token in its environment: it never sees the database
URL or the bot token), and publishes what comes back as a live article under
`WEEKLY_ARTICLE_AUTHOR`, announced in the news channel. The facts include
EA-controlled strings (player and club names), which is why the model has no tools
and is told to use only the JSON. Its HTML is sanitised like any other. Staff can
edit or unpublish it afterwards. A stretch with no matches and no squad changes is
a clean skip. If Claude can't be reached (say a usage limit) the job exits non-zero
and the service retries hourly, up to six times.

It bills to a Claude subscription, not API credits. One-time setup on the droplet:

```bash
# install the CLI for the yeehaw user (lands in /opt/yeehaw/.local/bin)
sudo -u yeehaw -H bash -c 'curl -fsSL https://claude.ai/install.sh | bash'
# a long-lived token for your Claude account (opens a sign-in link)
sudo -u yeehaw -H /opt/yeehaw/.local/bin/claude setup-token
```

Put the printed token in `.env` as `CLAUDE_CODE_OAUTH_TOKEN` (empty disables the
job). The service's `PATH` includes `/opt/yeehaw/.local/bin`; set `CLAUDE_BIN` if the
CLI lives elsewhere. Preview one without publishing:

```bash
cd /opt/yeehaw/yeehaw && sudo -u yeehaw npm run article:job -- --dry-run
```

The token lasts about a year; when it expires `journalctl -u yeehaw-article`
shows the failure and `claude setup-token` fixes it. The CLI is a Node program and
needs a few hundred MB: the service is capped at 700 MB, which needs the swap the
build already requires.

## Troubleshooting

- **Sign-in fails**: the redirect registered on Discord must be exactly
  `https://yeehaw-fc.club/api/auth/callback/discord`, and `NEXTAUTH_URL` must
  be `https://yeehaw-fc.club` (no `www`, no trailing slash).
- **Signed in but "Access restricted"**: none of the person's roles is mapped
  to a permission on the Admin page, or they aren't in the server.
- **Accepted but the roles didn't change**: the contract's row on Admin →
  Seasons & contracts shows why. Usually no squad / status role is mapped on
  Discord roles & channels, or the bot's role sits below them in the server's
  role list.
- **An offer never reached the player**: their DMs are closed and no roster
  channel is mapped. They can still accept on their hub, or use **Send again**
  on the window screen once a roster channel is set.
- **Bot shows offline**: `systemctl status yeehaw-gateway` and
  `journalctl -u yeehaw-gateway`.
- **Buttons say "This interaction failed"**: the interactions endpoint URL
  isn't set, or `DISCORD_PUBLIC_KEY` is wrong (every request gets a 401).
- **"No events channel is set"** when announcing: pick the events channel on
  Admin → Discord roles & channels.
- **Reminders or announcements never arrive**: `journalctl -u yeehaw-notify`
  (is the timer enabled? `systemctl list-timers yeehaw-notify`).
- **Stats and the league table are empty**: `EA_CLUB_ID` is unset, or the poll
  hasn't run (`systemctl list-timers yeehaw-ea-poll`, `journalctl -u yeehaw-ea-poll`).
  `HTTP 403` in that journal is EA's edge: see "The hourly EA poll".
- **A match report says nothing is linked**: EA matches are linked to match-type
  events (match, scrim, tournament) when they were played between 30 minutes before
  kick-off and 30 minutes after the event's end; friendlies aren't polled at all.
- **A player's matches don't count**: their gamertag isn't linked (hub, Manage tab).
  Lines already stored are picked up on the next poll once it is.
- **No Man of the Match vote appeared**: it opens two hours after kick-off from the
  hourly notify job, needs an events channel on the Admin page to be posted, and only
  for match-type events; staff can open it sooner on the event page.
- **The roundup never publishes**: `journalctl -u yeehaw-article`. No token, the
  off-days between roundups and a quiet stretch are all clean skips that say so.
- **Build killed partway**: out of memory. Add swap.
