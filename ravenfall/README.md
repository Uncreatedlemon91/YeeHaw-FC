# Ravenfall HQ

Operations portal and Discord companion for **Ravenfall PMC**, a milsim
community, served at [ravenfallpmc.com](https://ravenfallpmc.com). It
shares the droplet with YeeHaw FC but nothing else: its own user, directory,
database, port and Discord application.

Next.js 15 (App Router, TypeScript), Tailwind v4 with shadcn/ui-style
components, PostgreSQL via Prisma, NextAuth with Discord.

## What it does

- **Discord sign-in only.** There is no registration. Site permissions come
  straight from the member's roles on the unit's server, re-read every five
  minutes, so a promotion on Discord reaches the site without signing out.
  Which Discord role means what is set on the **Admin** page.
- **Personnel files from Discord roles.** Anyone holding a mapped role
  (a permission, rank, squad, billet or Recruit) gets a personnel file
  without signing in: rank, squad and billets are read from their roles and
  the callsign from their nickname (`Sgt Viper` → Viper). The Admin page's
  **Sync profiles from Discord** does the whole server at once, and with the
  bot online it happens on its own whenever someone joins or their roles
  change. Discord only fills blanks: once a file has a rank or squad, the
  site owns it and pushes changes back out to Discord.
- **Recruitment pipeline.** `/enlist` on Discord (or the pinned Enlist Now
  button in #welcome) → `/apply` questionnaire → an embed on
  #recruitment-board with **Approve / Deny / View Web Application** →
  approving (on Discord or the website) sets the nickname to
  `Rct Callsign`, adds the Recruit role, removes Candidate, creates the
  member's profile and writes their ENLISTMENT service record. The board
  post updates itself, whichever side the decision came from.
- **Public About pages.** `/about/ranks` (the rank ladder and what each
  promotion needs) and `/about/billets` (squads, slots, roles and their
  training), aimed at people thinking of joining and visible signed out.
  Rank and billet content comes from `src/config/unit.ts`; qualification
  titles come from the vault. Add a page by creating `app/about/<slug>/page.tsx`
  and one line in `src/config/about.ts`.
- **Roster and personnel files.** One page, two views: by element (the
  ORBAT, below) or a list searchable by callsign, rank, squad, role and
  status. Each member has a personnel jacket: an ID card with service
  number and rank insignia, a ribbon rack (awards in real rack order: rows
  of three, senior ribbon top-left, a short row centred on top, oak leaves,
  stars or a numeral for repeats; hover a ribbon for its date and citation)
  with the member's qualifications as skill badges under it (linked to their
  library manual), and tabs for their file (statement, availability,
  deployment log), a filterable service record, career progress, billet,
  **Awards** (every award with citations, credit and op; Command revokes
  here and sees revoked ones struck through) and requests. Changing a member's rank, squad or
  status writes the PROMOTION / TRANSFER / DISCHARGE entry for you. A new
  rank renames them on Discord to the rank's short form and their callsign
  (`Pvt Viper`, `Cdr Raven`; the short forms are in `unit.ts`). Without a
  callsign their current Discord name is used.
- **Billets and the ORBAT.** Every squad has slot caps per role, and every
  role lists the vault qualifications it needs (both in `unit.ts`). The
  roster's default view, **By element**, is the order of battle: the unit
  tree with filled and vacant slots, and a replacement pool for anyone
  without one. A vacant slot the viewer qualifies for links straight to a
  billet request; one they don't has **Interested** instead. (`/orbat`
  redirects there.)
- **Billet interest.** Active members put their name in for a vacant slot,
  qualified or not, from the ORBAT or from a role on `/about/billets`
  (which lists each role's open slots; signed-out visitors are asked to sign
  in, guests to enlist). It's a request like any other: it posts to the
  personnel board, queues on the S1 Desk, and is decided by the same rules
  as a billet change (squad leadership within their squad, Command for a
  transfer). Approval re-checks the slot is still open. A qualified member
  is seated in it (TRANSFER record, Discord roles follow); one who isn't is
  selected for it (a NOTE naming the training they still need) and told to
  request the billet once qualified. Up to three open interests at a time.
- **S1 Desk (`/personnel`).** Members request a billet (one primary, up to
  two secondaries), a callsign change or a leave of absence from their own
  file. Requests post to the personnel board on Discord with Approve / Deny
  and queue on the S1 Desk. Approving applies the change, writes the service
  record, syncs squad and billet roles and the nickname on Discord, and DMs
  the member. Approved leave excuses them from every event in the window,
  and the AAR form pre-marks them Excused. The desk also has a promotion
  board (members meeting the next rank's criteria) and a leave roster.
- **Career progression.** Per-rank criteria live in `unit.ts`: events
  attended, days in the PMC, days in the current rank (Private First Class
  up), optional qualifications, and leadership approval from Corporal up,
  plus the usual total time as guidance. They are paced for a long-term
  unit: Corporal takes about six months, Staff Sergeant about a year. The career tab shows
  the checklist with an Eligible (or, where approval is needed, Ready for
  review) stamp, and the S1 Desk's promotion board lists who's there.
  Command still promotes by hand.
- **Operations.** List and month-calendar views, one-click RSVP, optional
  Discord announcement, and an after-action report editor where leaders
  write the debrief and mark who actually attended, was excused or no-showed.
- **Awards & decorations (`/vault`).** A public catalog (visible signed out)
  of the unit's ribbons and medals in rack order: each award's ribbon, optional
  medal art, description and criteria. The Hall of Honour on an award's page
  (who holds it) is for operators only. Command edits the catalog at
  **Admin → Awards editor** (`/admin/awards`): a stripe builder with a live
  SVG preview, precedence (move up / down), repeat devices (oak leaf, star or
  numeral), an optional automatic rule, medal art upload (PNG/JPG/WebP, 5 MB,
  stored beside the library images) and retire. A starter catalog (service,
  operations, good conduct, valor, lifesaver, commendations, unit citation) is
  added by a migration, insert-if-missing by slug.
- **Giving awards.** Squad leaders nominate members of the squads they lead,
  and Command anyone, from the personnel file (**Nominate for an award**: pick
  the award with its ribbon, write a citation, optionally pick the op).
  Nobody nominates themselves. Command approves or denies on the **S1 Desk →
  Awards** with an optional note, and never decides a nomination they made or
  one about themselves. Approval gives the award and writes an Award entry on
  the service record. Command can **revoke** an award (reason required, also
  on the service record) from the member's Awards tab; a revoked award keeps
  its row, so an automatic award is never re-issued.
- **Automatic awards.** Awards with a rule (days of service, operations
  attended, campaign tag, good conduct) are given without a nomination: when
  an after-action report is filed (for that op's attendees) and once a day by
  `ravenfall-awards.timer` (about 04:20; `deploy/awards.sh` calls the site's
  internal `/api/internal/awards` with the same token as the gateway). Runs
  are idempotent. An operations rule `threshold: 10, every: 10` on a repeatable
  award owes award n at 10 + 10(n-1) ops. The campaign tag matches the op's
  title or description (operations have no tag field), case-insensitively.
  Good conduct needs the member to be active, enlisted that long, with no
  disciplinary entry in the window. Run one by hand with
  `sudo -u ravenfall bash /opt/ravenfall/ravenfall/deploy/awards.sh`.
- **Awards on Discord.** Each award given (approved or automatic) is posted
  in the awards channel and the member gets a DM. Up to three awards in one
  run get an embed each; more become one grouped summary, and a member
  receives one DM per run. If the post fails it is retried on the next run for
  three days. If a personnel board channel is set, Command is also pinged
  there when a nomination is filed. Discord never blocks the save.
- **Qualifications** are skills, not ribbons. They stay as data (billet and
  rank prerequisites) and their manuals are Library documents, one per
  qualification in the **Qualification manuals** folder, linked through the
  document's related qualifications. `/vault/<qualification-slug>` redirects
  to the manual. Instructors create and edit qualifications from the Awards
  page and award or revoke them from a member's personnel file.
- **Document library (`/library`).** Markdown documents in nested folders,
  with four clearance tiers: Public (anyone, listed on the landing page),
  Unit (any operator), Leadership (squad leaders, instructors, Command) and
  Command. A folder's clearance is a floor: documents and subfolders can be
  equal or stricter, never looser. Readers only see what they're cleared
  for, and search is PostgreSQL full-text. Instructors and Command publish
  and organise folders; only Command deletes documents or a non-empty
  folder. Every title or content edit keeps a revision: view, compare two
  (line diff) or restore (which writes a new revision). Editors upload
  PNG/JPG/WebP images (up to 5 MB) with an Insert image button; they're
  served only to readers cleared for the document they belong to. Documents
  can link to related vault qualifications, shown on both pages.
- **Required reading.** A document can be required of everyone, of a rank
  and above, of specific ranks, billets or squads (targets add up). Active
  members it's required of, and cleared to read, press "I have read and
  understood" in the reader. Edits to a required document are Minor
  (acknowledgements stand) or Major (everyone acknowledges again). Outstanding
  reading shows as a dashboard banner and on the Career tab of the personnel
  file (the member and squad leadership), can gate a promotion
  (`requiredReading: true` on a rank in `src/config/unit.ts`), and
  `/library/compliance` lists who hasn't acknowledged what (Command and
  instructors see everyone, squad leaders their squads). Clearance for these
  checks comes from the database (active = Unit, billet that leads =
  Leadership, `ADMIN_USER_IDS` = Command); a signed-in member is judged on
  their real permissions.
- **Library on Discord.** New Public and Unit documents, and major updates to
  required reading, are announced in the library channel (never Leadership or
  Command documents). Members a document newly becomes required of get a
  DM with a link (sent one by one, at most 150 per save; failures are logged,
  never block the save).
- **Public landing page** at `/` with the Enlist Now call to action.

### Permissions

| Level | From | Can |
|---|---|---|
| ADMIN | Command Staff roles (or `ADMIN_USER_IDS`) | everything, plus profile edits, deleting events/docs/records, the Admin page and awards editor |
| RECRUITER | Recruiter roles | decide applications, add enlistment/note entries |
| INSTRUCTOR | Instructor / NCO roles | schedule events, file AARs, manage qualifications, award them, publish in the library |
| OPERATOR | Operator roles | dashboard, calendar & RSVP, roster, dossiers, library, the Hall of Honour |
| guest / candidate | no mapped role | landing page, `/apply`, their application status |

RECRUITER and INSTRUCTOR each include OPERATOR; one person can hold both.

**Squad leadership** isn't a Discord role. It comes from the billet: an
active member whose primary role has `leads: true` in `unit.ts` (Team
Leader, Assistant Team Leader) leads their own squad, and a Command billet leads
every squad. Personnel files have three clearance tiers:

| Clearance | Who | Sees |
|---|---|---|
| Unit | any operator | the public file: identity, billet, quals, statement, service record |
| Squad leadership | the member, and leaders of their squad | plus availability, attendance detail, counselling entries, promotion progress, requests and leave reasons |
| Command | ADMIN | everything, including disciplinary entries (also shown to the member) |

Restricted sections render as redaction bars. Leaders decide billet
changes within their squad and their squad's leave. Transfers between
squads and callsign changes go to Command. Nobody decides their own
request.

### The bot

Slash commands and button presses come in as signed HTTP requests to
`/api/discord/interactions`, and roles, nicknames and embeds go out over
Discord's REST API. Those work on their own.

A small second service, `ravenfall-gateway` (`scripts/gateway.mjs`, no
dependencies, ~40 MB), holds a gateway connection. That's what makes Discord
show the bot **online** (it can't be online without one), and it passes
member joins and role changes to the site so personnel files follow
(`/api/internal/member-sync`, authenticated with a token derived from
`NEXTAUTH_SECRET`). If it's down the bot shows offline and files only
update on sign-in or a manual sync; everything else keeps working. The
Admin page shows its status.

## Code map

```
src/config/unit.ts           unit name, ranks, squads, roles, application questions
src/lib/auth.ts              NextAuth + Discord role → permission sync
src/lib/permissions.ts       the permission model
src/lib/discord.ts           Discord REST client
src/lib/recruitment.ts       approve / deny pipeline (shared by web and Discord)
src/lib/personnel.ts         clearance, billets, leave, and the S1 request pipeline (shared by web and Discord)
src/lib/career.ts            promotion criteria checklist
src/lib/awards.ts            ribbon stripe validation, repeat devices, automatic award rules
src/lib/award-service.ts     who may nominate / decide, and the one place an award is granted
src/lib/award-evaluator.ts   automatic awards (after an AAR and daily; idempotent)
src/lib/award-notify.ts      award announcement embed, member DMs, nomination heads-up
src/lib/qualifications.ts    qualification manuals folder and slug helpers
src/components/ribbon.tsx    the SVG ribbon (stripes and devices)
src/components/rack.tsx      the personnel-file ribbon rack and qualification skill badges
src/lib/library.ts           library clearance, folder tree and search
src/lib/required-reading.ts  who must read what, acknowledgements and compliance
src/lib/library-notify.ts    library announcement embed and required-reading DMs
src/lib/library-images.ts    library image storage on disk (LIBRARY_UPLOAD_DIR)
src/lib/diff.ts              line diff for library revisions
src/lib/role-config.ts       Discord role mapping (Admin page; .env fallback)
src/lib/member-sync.ts       personnel files generated from Discord roles
src/app/api/discord/interactions/route.ts   slash commands, buttons, modals
src/app/api/internal/*       endpoints the gateway process calls
scripts/gateway.mjs          gateway connection: bot presence + member events
src/app/*                    pages; each folder's actions.ts holds its server actions
prisma/schema.prisma         data model
deploy/                      systemd units, update, backup and daily awards scripts
```

Ranks (with promotion criteria), squads (with billet caps), unit roles
(with qualification prerequisites), the doctrine blurbs and the
application questions are all in `src/config/unit.ts`. Edit and redeploy.
Qualification prerequisites refer to qualification slugs, so a renamed
qualification needs its slug updated there too.

## Local development

Needs Node 22 and a PostgreSQL database.

```bash
cd ravenfall
npm install
cp .env.example .env              # at least DATABASE_URL, NEXTAUTH_SECRET, Discord OAuth
npx prisma migrate dev            # creates the tables
npm run db:seed                   # starter qualifications (the award catalog comes with the migrations)
npm run dev                       # http://localhost:3000
```

For local Discord sign-in, add `http://localhost:3000/api/auth/callback/discord`
as a redirect on the Discord application and set
`NEXTAUTH_URL=http://localhost:3000`.

`npm run typecheck` and `npm run build` are the checks.

---

## Discord setup

Create a **new** application at <https://discord.com/developers/applications>.
Don't reuse YeeHaw FC's: each app has exactly one interactions endpoint.

1. **OAuth2** → copy Client ID and Client Secret. Add the redirect
   `https://ravenfallpmc.com/api/auth/callback/discord`.
2. **General Information** → copy the Public Key.
3. **Bot** → Reset Token and copy it. Under **Privileged Gateway Intents**,
   turn on **Server Members Intent**: it lets the bot list members and see
   role changes, which is how personnel files are generated. Without it the
   bot still comes online, but files only fill in at sign-in.
4. **Invite the bot**. Use OAuth2 → URL Generator, with scopes `bot` and
   `applications.commands`. Give it these permissions: View Channels, Send
   Messages, Embed Links, Manage Roles, Manage Nicknames.
5. **Server Settings → Roles**: drag the bot's role **above** Recruit and
   Candidate (and above anyone it renames). Discord refuses with a 403
   otherwise, and the site says so. It can never rename the server owner.
6. With the site deployed and reachable, set **General Information →
   Interactions Endpoint URL** to
   `https://ravenfallpmc.com/api/discord/interactions`. Discord checks it as
   you save, so the site has to be running first.
7. Sign in, open **Admin**. Under **Discord channels**, pick the
   recruitment board, welcome channel and (optionally) the ops, personnel
   library and awards announcements channels, and save. Give the bot View Channel, Send Messages
   and Embed Links in each. Then press **Register commands** and **Post to
   welcome channel**, and pin the welcome message in Discord.
8. On **Admin → Discord role mapping**, pick which Discord roles grant each
   site permission, the Candidate and Recruit roles, and (optionally) the
   roles for each rank, squad and billet. Save, then press **Sync profiles
   from Discord** to open personnel files for everyone already in the unit.
   For any role the bot assigns, drag the bot's role above it first.
For the S1 Desk, make the personnel board a leadership-only channel.

User IDs: enable Developer Mode (User Settings → Advanced),
then right-click → Copy ID. For first setup, put your own user ID in
`ADMIN_USER_IDS` so you can reach the Admin page before any role is mapped,
and clear it once a Command Staff role is saved. The `ROLE_*` and
`*_CHANNEL_ID` settings in `.env` still work, but only until the mapping
(or the channels) are first saved on the Admin
page; after that the page is the one source.

---

## Deploying on the droplet (alongside YeeHaw FC)

Everything below is run as root over SSH. YeeHaw FC keeps running
throughout; the only shared piece is Caddy's config.

### 1. DNS

Point two A records at the droplet's IP: `ravenfallpmc.com` and
`www.ravenfallpmc.com`.

### 2. Swap (once)

A Next.js build wants more than the $6 droplet's 1 GB of RAM. A swapfile
keeps it from being OOM-killed (and gives YeeHaw FC headroom while it runs):

```bash
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

At runtime the site uses roughly 120–200 MB and PostgreSQL about 50–100 MB.
Both sites fit in 1 GB. If `free -h` shows swap in steady use, resize the
droplet to 2 GB.

### 3. Node.js 22 and PostgreSQL

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs postgresql
```

### 4. User, clone and database

```bash
git clone https://github.com/Uncreatedlemon91/ValorLink.git /opt/ravenfall
useradd --system --home-dir /opt/ravenfall --shell /usr/sbin/nologin ravenfall
chown -R ravenfall:ravenfall /opt/ravenfall

# A database role matching the OS user: peer auth over the local socket,
# so there's no database password to manage or leak.
sudo -u postgres createuser ravenfall
sudo -u postgres createdb -O ravenfall ravenfall
```

### 5. Configure

```bash
cd /opt/ravenfall/ravenfall
sudo -u ravenfall cp .env.example .env
openssl rand -hex 32            # paste as NEXTAUTH_SECRET
sudo -u ravenfall nano .env
chmod 600 .env
```

Set the database URL for the socket:

```ini
DATABASE_URL="postgresql://ravenfall@localhost/ravenfall?host=/var/run/postgresql"
```

Fill in the rest from **Discord setup** above. `.env.example` documents
every value.

### 6. Build and start

```bash
sudo bash /opt/ravenfall/ravenfall/deploy/update.sh
sudo -u ravenfall bash -c 'cd /opt/ravenfall/ravenfall && npm run db:seed'   # optional starter manuals
```

`update.sh` installs dependencies, runs migrations, builds, installs the
`ravenfall` and `ravenfall-backup` units, and (re)starts the site on
`127.0.0.1:8002`.

### 7. Caddy

The repo's `deploy/Caddyfile` carries both sites. Copy it from **either**
clone (they're the same repo) and reload:

```bash
cp /opt/ravenfall/deploy/Caddyfile /etc/caddy/Caddyfile
systemctl reload caddy
```

Caddy gets the certificate as soon as DNS resolves. Visit
<https://ravenfallpmc.com>, sign in, and finish **Discord setup** steps 6–7.

## Updating

```bash
cd /opt/ravenfall && sudo -u ravenfall git pull
sudo bash ravenfall/deploy/update.sh
```

If you edit only `.env`, a `sudo systemctl restart ravenfall` is enough; no
rebuild is needed.

## Backups

`ravenfall-backup.timer` runs `deploy/backup.sh` daily at about 03:45. It
`pg_dump`s to `/opt/ravenfall/backups` and keeps the newest 14.
It also tars the library images (`LIBRARY_UPLOAD_DIR`, default
`/opt/ravenfall/uploads/library`) to `ravenfall-uploads-*.tar.gz`, with the
same retention; `update.sh` creates that directory, owned by `ravenfall`.
`BACKUP_DIR` and `BACKUP_RETENTION` in `.env` change the rest.

`ravenfall-awards.timer` is the other daily job: it evaluates automatic awards
(see Awards above) at about 04:20. Both timers are installed by `update.sh`.
`systemctl list-timers ravenfall-awards.timer` shows the next run;
`journalctl -u ravenfall-awards` the last result.

```bash
systemctl list-timers ravenfall-backup.timer
sudo -u ravenfall bash /opt/ravenfall/ravenfall/deploy/backup.sh         # one now
gunzip -c /opt/ravenfall/backups/ravenfall-XXXX.sql.gz | sudo -u ravenfall psql ravenfall   # restore
sudo -u ravenfall tar -xzf /opt/ravenfall/backups/ravenfall-uploads-XXXX.tar.gz -C /opt/ravenfall/uploads   # restore images
```

Copy them off the droplet too, for example with `rclone` (YeeHaw FC's
`backup.sh` does it when `BACKUP_REMOTE` is set: see "Backups" in
`yeehaw/README.md`).

## Troubleshooting

- **Sign-in fails**: the redirect registered on Discord must be exactly
  `https://ravenfallpmc.com/api/auth/callback/discord`, and `NEXTAUTH_URL`
  must be `https://ravenfallpmc.com` (no `www`, no trailing slash).
- **Signed in but "Access denied"**: none of the member's roles is mapped
  to a permission on the Admin page, or they aren't in the server.
- **Bot shows offline**: `systemctl status ravenfall-gateway` and
  `journalctl -u ravenfall-gateway`. A bad token stops it with a message
  saying so.
- **"Sync profiles" says Discord refused**: turn on Server Members Intent
  (Discord setup step 3).
- **Approve/Deny buttons say "This interaction failed"**: the interactions
  endpoint URL isn't set, or `DISCORD_PUBLIC_KEY` is wrong (every request
  gets a 401). `journalctl -u ravenfall` shows it.
- **Approved, but a warning about roles or the nickname**: see Discord
  setup step 5. The approval itself still went through.
- **Build killed partway**: out of memory. Add swap (step 2).
- **502 on ravenfallpmc.com**: the app isn't running.
  `systemctl status ravenfall`.
