# Cutover: the old YeeHaw FC site to this one

Moves yeehaw-fc.club from the Python site (`/opt/valorlink`, user `valorlink`,
SQLite) to this app (`/opt/yeehaw`, user `yeehaw`, PostgreSQL), on the same
droplet that runs Ravenfall HQ. Same Discord application, same domain, same
port 8001, so Caddy does not change.

Expect **10 to 20 minutes of downtime**: the old site must stop before the new
one can take port 8001, and the build runs after that. Pick a quiet hour, away
from a match or the reminder DMs, and do not run the old site's timers during it.

Run everything as root over SSH unless a line says otherwise. Commands that
write data are marked **(writes)**.

**Memory.** The droplet has 1 GB of RAM. A build needs more than that, so
Ravenfall's swapfile must be there (`swapon --show` lists 2 GB; if not, create it
as in `ravenfall/README.md` step 2). The build in step 7 runs with the old site
already stopped, which frees about 150 MB; do not build while the old site and
Ravenfall are both busy, and do not start a second build at the same time.

---

## 0. Before you start (the day before is fine)

- [ ] You can sign in to the [Discord Developer Portal](https://discord.com/developers/applications)
      and edit the YeeHaw application, and you have Administrator in the server.
- [ ] **Write down the two URLs you will change** (rollback needs them):
      OAuth2 redirect(s), and General Information → Interactions Endpoint URL
      (the old one is `https://yeehaw-fc.club/discord/interactions`).
- [ ] Your own Discord user ID (Developer Mode, right-click your name, Copy User
      ID). It goes in `ADMIN_USER_IDS` so you can reach Admin on the first sign-in.
- [ ] Node 22.5 or later on the droplet (`node --version`; Ravenfall's NodeSource
      Node 22 qualifies). The migration uses `node:sqlite`.
- [ ] If the AI roundup should keep running: the old `.env`'s `CLAUDE_CODE_OAUTH_TOKEN`
      (reused as is) and, for the new `yeehaw` user, the Claude Code CLI (step 7).

## 1. Prepare the new site while the old one is still running

Nothing here touches the old site or port 8001.

```bash
apt install -y python3-venv python3-pip sqlite3 postgresql   # sqlite3 is for the backup in step 2

# Checkout (a fresh clone; /opt/valorlink stays as it is for rollback)
git clone https://github.com/Uncreatedlemon91/ValorLink.git /opt/yeehaw
cd /opt/yeehaw && git checkout claude/eloquent-noether-2ulsa2   # or main, once merged
useradd --system --home-dir /opt/yeehaw --shell /usr/sbin/nologin yeehaw
chown -R yeehaw:yeehaw /opt/yeehaw

# Database role with the same name as the OS user: peer auth, no password
sudo -u postgres createuser yeehaw
sudo -u postgres createdb -O yeehaw yeehaw
```

Create `/opt/yeehaw/yeehaw/.env`:

```bash
cd /opt/yeehaw/yeehaw
sudo -u yeehaw cp .env.example .env
openssl rand -hex 32          # use as NEXTAUTH_SECRET
sudo -u yeehaw nano .env && chmod 600 .env
```

Map the old `/opt/valorlink/proclubs/.env` onto the new names:

| Old (`proclubs/.env`) | New (`yeehaw/.env`) | Notes |
|---|---|---|
| `CLUB_ID` | `EA_CLUB_ID` | |
| `CLUB_PLATFORM` | `EA_PLATFORM` | `common-gen5` unless you changed it |
| `CLUB_NAME` | `EA_CLUB_NAME` | |
| `LEAGUE_TABLE_MAX_TEAMS` | `EA_LEAGUE_MAX_TEAMS` | |
| `SITE_BASE_URL` | `NEXTAUTH_URL` | `https://yeehaw-fc.club`, no `www`, no trailing slash |
| `SESSION_SECRET` | `NEXTAUTH_SECRET` | **new** value from `openssl rand -hex 32`; everyone signs in again once |
| `ARTICLE_TIMEZONE` | `CLUB_TIMEZONE` | `America/New_York` by default |
| `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` | same names | |
| `DISCORD_PUBLIC_KEY`, `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID` | same names | |
| `DISCORD_STAFF_ROLE_ID` | `ROLE_IDS_MANAGEMENT` | the migration also copies it into the saved role mapping |
| `CLAUDE_CODE_OAUTH_TOKEN`, `CLAUDE_BIN`, `CLAUDE_MODEL` | same names | |
| `ROUNDUP_DAYS`, `WEEKLY_ARTICLE_AUTHOR` | same names | keep the byline: old AI articles are recognised by it |
| `DISCORD_OAUTH_REDIRECT` | (gone) | fixed at `<NEXTAUTH_URL>/api/auth/callback/discord` |
| `*_CHANNEL_ID`, `ROLE_*_ID`, `ROSTER_SQUAD_ROLE_ID` | (Admin page) | the migration imports what it finds, see step 8 |
| `TWITCH_*`, `CLIPS_CHANNEL_ID`, `COACH_NOTES_CHANNEL_ID`, `DEV_LOGIN`, `HTTPS_ONLY`, `NOTIFY_DMS` | (dropped) | |

And set the ones that are new:

```ini
DATABASE_URL="postgresql://yeehaw@localhost/yeehaw?host=/var/run/postgresql"
UPLOAD_DIR="/opt/yeehaw/uploads"
ADMIN_USER_IDS="<your discord user id>"
EA_FETCHER="curl_cffi"
EA_PYTHON="/opt/yeehaw/venv/bin/python"
```

Install dependencies and apply the migrations (this builds nothing yet), then
**dry-run the data migration against a live copy of the old data**. A dry run
writes nothing; read its warnings now, not at 11 pm:

```bash
cd /opt/yeehaw/yeehaw
sudo -u yeehaw npm ci --no-audit --no-fund
sudo -u yeehaw npx prisma migrate deploy        # never `migrate dev`: it would drop the partial indexes

mkdir -p /root/cutover && chmod 700 /root/cutover
sqlite3 /opt/valorlink/proclubs/data/site.db    ".backup '/root/cutover/site.db'"
sqlite3 /opt/valorlink/proclubs/data/history.db ".backup '/root/cutover/history.db'"
install -d -o yeehaw -g yeehaw -m 700 /opt/yeehaw/import
install -o yeehaw -g yeehaw -m 600 /root/cutover/site.db /root/cutover/history.db /opt/yeehaw/import/
cp /opt/valorlink/proclubs/.env /opt/yeehaw/import/old.env && chown yeehaw:yeehaw /opt/yeehaw/import/old.env && chmod 600 /opt/yeehaw/import/old.env

sudo -u yeehaw npm run migrate:proclubs -- --site /opt/yeehaw/import/site.db \
    --history /opt/yeehaw/import/history.db --old-env /opt/yeehaw/import/old.env --dry-run
```

You should see counts for players, contracts (one per player currently under
contract), events, articles and EA matches. Warnings you can ignore: "more than one
live contract", "unknown type", a gamertag shared by two accounts (fix by hand
afterwards on the player's hub). Anything that looks wrong: stop and look before
the real run.

## 2. Back up everything of the old site (writes)

Still with the old site running is fine; this is repeated for the final copy in
step 4 after it stops.

```bash
mkdir -p /root/cutover && cd /root/cutover
tar -czf old-site-files.tgz /opt/valorlink/proclubs/.env /opt/valorlink/proclubs/data \
    /etc/systemd/system/yeehaw-fc*.service /etc/systemd/system/yeehaw-fc*.timer \
    /etc/systemd/system/proclubs-*.service /etc/systemd/system/proclubs-*.timer /etc/caddy/Caddyfile
ls -la /root/cutover
```

Copy `/root/cutover` off the droplet (`scp -r root@droplet:/root/cutover .`). The
old Discord URLs you wrote down in step 0 belong with it.

## 3. Stop and disable every old unit (the downtime starts here)

```bash
systemctl disable --now yeehaw-fc.service \
    yeehaw-fc-backup.timer proclubs-poll.timer proclubs-clips-poll.timer \
    proclubs-reactions-poll.timer proclubs-event-invites-poll.timer \
    proclubs-notify-poll.timer proclubs-weekly-article.timer
systemctl stop 'proclubs-*.service' yeehaw-fc-backup.service 2>/dev/null || true

# Nothing old may be left running, and 8001 must be free:
systemctl list-units --all --no-legend 'proclubs-*' 'yeehaw-fc*'
ss -ltnp | grep ':8001' || echo "8001 is free"
```

Leave the unit files and `/opt/valorlink` where they are: that is the rollback.
(They are only disabled; delete them a week or two after the new site has proven
itself.)

## 4. Take the final copy of the old data (writes)

The site is stopped, so nothing changes any more. Repeat the copy from step 1 so the
migration sees the last sign-ups, then migrate for real:

```bash
sqlite3 /opt/valorlink/proclubs/data/site.db    ".backup '/root/cutover/site.db'"
sqlite3 /opt/valorlink/proclubs/data/history.db ".backup '/root/cutover/history.db'"
install -o yeehaw -g yeehaw -m 600 /root/cutover/site.db /root/cutover/history.db /opt/yeehaw/import/

cd /opt/yeehaw/yeehaw
sudo -u yeehaw npm run migrate:proclubs -- --site /opt/yeehaw/import/site.db \
    --history /opt/yeehaw/import/history.db --old-env /opt/yeehaw/import/old.env
```

It runs in one transaction: either everything is written or nothing is, and the
cover images it copied are removed again on failure. It refuses a non-empty
database; if it stops for that reason after you signed in or tested something,
either drop and recreate the database (`dropdb yeehaw && createdb -O yeehaw yeehaw`
as postgres, then step 1's `migrate deploy`) or pass `--force`, which reuses the
players that already exist.

A failed run is safe to repeat. To start over completely:
`sudo -u postgres dropdb yeehaw && sudo -u postgres createdb -O yeehaw yeehaw`,
`rm -rf /opt/yeehaw/uploads/articles`, `npx prisma migrate deploy`, then migrate again.

## 5. Install the Python fetcher, build and start

`update.sh` does it all: dependencies, the `/opt/yeehaw/venv` Python environment
with `curl_cffi` (EA blocks Node's TLS fingerprint, see the README), migrations,
the build (with `--max-old-space-size=1536`, on swap), the systemd units and the
start on port 8001. This is the slow step.

```bash
sudo bash /opt/yeehaw/yeehaw/deploy/update.sh
```

Check:

```bash
systemctl status yeehaw yeehaw-gateway --no-pager
curl -sI http://127.0.0.1:8001/ | head -1             # HTTP/1.1 200 OK
curl -sI https://yeehaw-fc.club/ | head -1            # 200 through Caddy
systemctl list-timers 'yeehaw-*'                      # backup, season-job, notify, ea-poll, article
```

Caddy needs no change: yeehaw-fc.club already proxies to 8001. (It is the same
`deploy/Caddyfile` the repo keeps for both sites.)

## 6. Discord Developer Portal (the one place old and new meet)

Two URLs change; the application, bot token, public key and guild do not.

1. **OAuth2 → Redirects**: add `https://yeehaw-fc.club/api/auth/callback/discord`
   and save. Remove the old redirect (the old site's callback) once the new
   sign-in works.
2. **General Information → Interactions Endpoint URL**: change
   `https://yeehaw-fc.club/discord/interactions` to
   `https://yeehaw-fc.club/api/discord/interactions` and save. **The path changes.**
   Discord sends a signed test request when you save; it fails unless the new site is up
   with the same `DISCORD_PUBLIC_KEY`.
3. **Bot → Privileged Gateway Intents**: **Server Members Intent** on (the old
   site did not need it; the new gateway service does).
4. Server Settings → Roles: the bot's role must sit **above** the squad, status and
   trialist roles it hands out, or role changes answer 403.

## 7. Admin page, first sign-in (about 10 minutes)

Sign in at https://yeehaw-fc.club with the Discord account whose ID is in
`ADMIN_USER_IDS`.

1. **Admin → Discord roles & channels.** The migration filled in what the old
   `.env` and role settings held. Check every dropdown, and set what it could not:
   - Channels: **news**, **events** (RSVP announcements and match-day posts),
     **roster** (offers, departures, season squad), **recruitment** (the old default
     was baked into the code, so pick it), and optionally **management** (season
     ending reminders) and **recognition** (milestones, Player of the Month; falls
     back to events).
   - Roles: Management (the old staff role), Staff and Member if you use them,
     the three club titles, the **squad** role, the three status roles and the
     trialist role.
   - Save, then clear `ADMIN_USER_IDS` from `.env` once a Management role is mapped
     and you still get into Admin (then `systemctl restart yeehaw`).
2. **Admin → Overview**: **Register commands** (`/fixtures`, `/squad`) and **Sync
   players from Discord** (opens player records for members holding a mapped role).
3. **Admin → Seasons & contracts**: open **Season 2**. The migration made it ACTIVE
   from 2026-10-20 for 12 weeks (a placeholder): set the real end date, then give
   **every contract a shirt number** and the captain and vice-captain.
   Contracts carried over have none.
4. **Admin → Club profile**: check the text carried over.
5. **Staff → Lineup**: build and publish the first-choice XI, so Home and Squad
   show the pitch.
6. **Fixtures**: for each upcoming event open it and press **Update Discord post**
   once. The old announcement is edited in place and its buttons start working
   with the new site (the old buttons stop working the moment the old site stops).
7. Start the first poll instead of waiting an hour:
   `systemctl start yeehaw-ea-poll && journalctl -u yeehaw-ea-poll -n 30`.
   It should report the clubs polled and few or no new milestones (the migration
   recorded the old ones as already announced, so nothing old is announced again). A line saying `curl_cffi is not installed` means
   `update.sh` could not create `/opt/yeehaw/venv` (`apt install python3-venv`, rerun it).
8. AI roundup (if used): install the CLI for the `yeehaw` user once, as in the README
   ("The AI roundup"), then preview with
   `cd /opt/yeehaw/yeehaw && sudo -u yeehaw npm run article:job -- --dry-run`.

## 8. Smoke test

- [ ] `/`, `/squad`, `/fixtures`, `/news`, `/club`, `/club/stats`, `/club/league` load.
- [ ] A member can sign in, answer an RSVP on the site and on the Discord button.
- [ ] `/fixtures` in Discord answers.
- [ ] A player's hub shows the carried-over contract, service record and stats.
- [ ] `systemctl --failed` lists nothing for `yeehaw*`.
- [ ] `sudo systemctl start yeehaw-backup && ls -la /opt/yeehaw/backups` shows a
      dump and an uploads archive.

## 9. Left behind on purpose

Clips, Twitch live, coach notes, article comments and likes, development goals
and reviews, event images, and contracts that had already ended. They stay in the
old files (`/opt/valorlink/proclubs/data`, `/root/cutover`). Coach notes are the one
item staff may want: export them before the old files go
(`sqlite3 /root/cutover/site.db "select author_name, body from coach_notes"`).

## Rollback

Everything the old site needs is untouched on disk, so going back takes minutes.
The new database can stay; it is not used by the old site.

```bash
# 1. Stop the new site (frees 8001) and its timers
systemctl disable --now yeehaw yeehaw-gateway yeehaw-backup.timer yeehaw-season-job.timer \
    yeehaw-notify.timer yeehaw-ea-poll.timer yeehaw-article.timer

# 2. Bring the old site back
systemctl enable --now yeehaw-fc.service yeehaw-fc-backup.timer proclubs-poll.timer \
    proclubs-clips-poll.timer proclubs-reactions-poll.timer proclubs-event-invites-poll.timer \
    proclubs-notify-poll.timer proclubs-weekly-article.timer
curl -sI http://127.0.0.1:8001/ | head -1
```

3. **Discord Developer Portal**: put the two URLs from step 0 back: the
   Interactions Endpoint URL (`https://yeehaw-fc.club/discord/interactions`) and the
   OAuth redirect.
4. Anything players did on the new site in the meantime (RSVPs, contracts accepted) lives
   only in the new database; the old site will not see it. If the new site ran for
   long, say so in the server, and redo the changes that matter by hand.

Run `systemctl start yeehaw-backup` before rolling back so the new data is saved
too (`/opt/yeehaw/backups`).
