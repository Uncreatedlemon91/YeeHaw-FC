# Ravenfall HQ

Operations portal and Discord companion for a milsim community
(ravenfallpmc.com). See **[`ravenfall/README.md`](ravenfall/README.md)**.

```
ravenfall/     Ravenfall HQ — Next.js, Prisma and PostgreSQL
deploy/        the droplet's Caddyfile
```

On the droplet: checkout `/opt/ravenfall`, OS user and database `ravenfall`,
port 8002. Deploy with `sudo bash /opt/ravenfall/ravenfall/deploy/update.sh`.

YeeHaw FC (yeehaw-fc.club) used to live here too. It was shut down and removed
in November 2026; its code is still in the git history.

## Working on it

```bash
cd ravenfall
npm install
cp .env.example .env # fill it in; needs a PostgreSQL database
npx prisma migrate deploy
npm run dev
npm run typecheck && npm run test && npm run build
```

## Caddy

`deploy/Caddyfile` replaces `/etc/caddy/Caddyfile` wholesale:

```bash
cp /opt/ravenfall/deploy/Caddyfile /etc/caddy/Caddyfile && systemctl reload caddy
```
