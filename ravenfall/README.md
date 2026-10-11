# Ravenfall HQ

Operations portal and Discord companion for the **Wardogs** milsim unit
(Ravenfall PMC), served at [ravenfallpmc.com](https://ravenfallpmc.com). It
shares the droplet with YeeHaw FC but nothing else: its own user, directory,
database, port and Discord application.

Next.js 15 (App Router, TypeScript), Tailwind v4 with shadcn/ui-style
components, PostgreSQL via Prisma, NextAuth with Discord.

## What it does

- **Discord sign-in only.** There is no registration. Site permissions come
  straight from the member's roles on the unit's server, re-read every five
  minutes, so a promotion on Discord reaches the site without signing out.
- **Recruitment pipeline.** `/enlist` on Discord (or the pinned Enlist Now
  button in #welcome) → `/apply` questionnaire → an embed on
  #recruitment-board with **Approve / Deny / View Web Application** →
  approving (on Discord or the website) sets the nickname to
  `[RCT] Callsign`, adds the Recruit role, removes Candidate, creates the
  member's profile and writes their ENLISTMENT service record. The board
  post updates itself, whichever side the decision came from.
- **Roster and dossiers.** Searchable by callsign, rank, squad, role and
  status. Each dossier shows the service record timeline, a ribbon rack of
  qualifications, and attendance stats. Changing a member's rank, squad or
  status writes the PROMOTION / TRANSFER / DISCHARGE entry for you and
  renames them on Discord.
- **Operations.** List and month-calendar views, one-click RSVP, optional
  Discord announcement, and an after-action report editor where leaders
  write the debrief and mark who actually attended, was excused or no-showed.
- **Qualification vault.** Markdown SOPs, versioned on each content edit.
  Instructors award qualifications from a member's dossier.
- **Public landing page** at `/` with the Enlist Now call to action.

### Permissions

| Level | From | Can |
|---|---|---|
| ADMIN | `ROLE_IDS_ADMIN` (or `ADMIN_USER_IDS`) | everything, plus profile edits, deleting events/docs/records, the Admin page |
| RECRUITER | `ROLE_IDS_RECRUITER` | decide applications, add enlistment/note entries |
| INSTRUCTOR | `ROLE_IDS_INSTRUCTOR` | schedule events, file AARs, edit the vault, award qualifications |
| OPERATOR | `ROLE_IDS_OPERATOR` | dashboard, calendar & RSVP, roster, dossiers, vault |
| guest / candidate | no mapped role | landing page, `/apply`, their application status |

RECRUITER and INSTRUCTOR each include OPERATOR; one person can hold both.
Disciplinary entries are visible only to Command and the member concerned.

### The bot

There is no `discord.js` process. Slash commands and button presses come in
as signed HTTP requests to `/api/discord/interactions`, and roles,
nicknames and embeds go out over Discord's REST API. Nothing extra has to
stay running, and it costs no memory on a droplet that already runs YeeHaw FC.

## Code map

```
src/config/unit.ts           unit name, ranks, squads, roles, application questions
src/lib/auth.ts              NextAuth + Discord role → permission sync
src/lib/permissions.ts       the permission model
src/lib/discord.ts           Discord REST client
src/lib/recruitment.ts       approve / deny pipeline (shared by web and Discord)
src/app/api/discord/interactions/route.ts   slash commands, buttons, modals
src/app/*                    pages; each folder's actions.ts holds its server actions
prisma/schema.prisma         data model
deploy/                      systemd units, update and backup scripts
```

Ranks, squads, unit roles, the doctrine blurbs and the application
questions are all in `src/config/unit.ts`. Edit and redeploy.

## Local development

Needs Node 22 and a PostgreSQL database.

```bash
cd ravenfall
npm install
cp .env.example .env              # at least DATABASE_URL, NEXTAUTH_SECRET, Discord OAuth
npx prisma migrate dev            # creates the tables
npm run db:seed                   # starter qualification manuals
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
3. **Bot** → Reset Token and copy it. No privileged intents are needed.
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
7. Sign in, open **Admin**, and press **Register commands** and **Post to
   welcome channel**. Pin the welcome message in Discord.

Role and channel IDs: enable Developer Mode (User Settings → Advanced),
then right-click → Copy ID. For first setup, put your own user ID in
`ADMIN_USER_IDS`. The Admin page then lists every role with its ID. Move to
`ROLE_IDS_ADMIN` and clear `ADMIN_USER_IDS` afterwards.

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
`BACKUP_DIR` and `BACKUP_RETENTION` in `.env` change that.

```bash
systemctl list-timers ravenfall-backup.timer
sudo -u ravenfall bash /opt/ravenfall/ravenfall/deploy/backup.sh         # one now
gunzip -c /opt/ravenfall/backups/ravenfall-XXXX.sql.gz | sudo -u ravenfall psql ravenfall   # restore
```

Copy them off the droplet too. `rclone`, set up as in YeeHaw FC's
`deploy/README.md`, works the same way.

## Troubleshooting

- **Sign-in fails**: the redirect registered on Discord must be exactly
  `https://ravenfallpmc.com/api/auth/callback/discord`, and `NEXTAUTH_URL`
  must be `https://ravenfallpmc.com` (no `www`, no trailing slash).
- **Signed in but "Access denied"**: the member's roles aren't in any
  `ROLE_IDS_*`, or they aren't in the server. The Admin page shows the
  mapping by role name.
- **Approve/Deny buttons say "This interaction failed"**: the interactions
  endpoint URL isn't set, or `DISCORD_PUBLIC_KEY` is wrong (every request
  gets a 401). `journalctl -u ravenfall` shows it.
- **Approved, but a warning about roles or the nickname**: see Discord
  setup step 5. The approval itself still went through.
- **Build killed partway**: out of memory. Add swap (step 2).
- **502 on ravenfallpmc.com**: the app isn't running.
  `systemctl status ravenfall`.
