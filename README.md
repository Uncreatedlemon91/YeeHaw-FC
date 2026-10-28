# YeeHaw FC and Ravenfall HQ

Two unrelated sites that share one DigitalOcean droplet, one Caddy reverse
proxy, and the same Next.js, Prisma and PostgreSQL stack.

```
yeehaw/        YeeHaw FC — the club site and Discord companion for an
               EA FC Pro Clubs side (yeehaw-fc.club) — see yeehaw/README.md
ravenfall/     Ravenfall HQ — a milsim unit portal (ravenfallpmc.com)
               — see ravenfall/README.md
deploy/        the Caddyfile that serves both domains
```

Each app is self-contained: its own `package.json`, Prisma schema and
migrations, `.env`, systemd units (`<app>/deploy/`), OS user, database and
checkout on the droplet. They share only the machine, Caddy and the swapfile.

| | YeeHaw FC | Ravenfall HQ |
|---|---|---|
| Domain | yeehaw-fc.club | ravenfallpmc.com |
| Port | 8001 | 8002 |
| Checkout | `/opt/yeehaw` | `/opt/ravenfall` |
| OS user, database | `yeehaw` | `ravenfall` |
| Deploy | `sudo bash /opt/yeehaw/yeehaw/deploy/update.sh` | `sudo bash /opt/ravenfall/ravenfall/deploy/update.sh` |

## YeeHaw FC

Next.js 15, Tailwind v4, Prisma, NextAuth with Discord. Seasons and
contracts, the squad and its first-choice XI, player hubs with service
records, events with RSVPs through Discord, EA stats polled hourly, news with
an AI-written roundup, recruitment, tactics and set pieces, all managed from an
Admin page that maps Discord roles and channels. Setup, permissions, the code
map and operations: **[`yeehaw/README.md`](yeehaw/README.md)**. Moving the live
domain from the old Python site: **[`yeehaw/deploy/CUTOVER.md`](yeehaw/deploy/CUTOVER.md)**.

## Ravenfall HQ

Operations portal and Discord companion for a milsim community. See **[`ravenfall/README.md`](ravenfall/README.md)**.

## Working on either

```bash
cd yeehaw            # or ravenfall
npm install
cp .env.example .env # fill it in; needs a PostgreSQL database
npx prisma migrate deploy
npm run dev
npm run typecheck && npm run test && npm run build
```

Never run `prisma migrate dev` in `yeehaw/`: its migrations carry raw SQL
(partial unique indexes) that `migrate dev` would drop. See its README.

## Caddy

`deploy/Caddyfile` replaces `/etc/caddy/Caddyfile` wholesale, so it carries
every site the droplet serves:

```bash
cp /opt/yeehaw/deploy/Caddyfile /etc/caddy/Caddyfile && systemctl reload caddy
```

Unofficial fan-run project. Not affiliated with EA.
