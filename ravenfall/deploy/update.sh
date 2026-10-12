#!/usr/bin/env bash
# Build and (re)start Ravenfall HQ. Run on the droplet after a git pull:
#   sudo bash /opt/ravenfall/ravenfall/deploy/update.sh
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
    echo "Run me with sudo." >&2
    exit 1
fi

APP=/opt/ravenfall/ravenfall
cd "$APP"
# Prisma and Next both read .env from the app directory themselves.
as_app() { sudo -u ravenfall -H "$@"; }

echo "== Installing dependencies"
as_app npm ci --no-audit --no-fund
echo "== Applying database migrations"
as_app npx prisma migrate deploy
echo "== Building (takes a few minutes on a small droplet)"
# On a 1 GB droplet Node defaults to a ~256 MB heap, which the type-check
# step outgrows. Let the build use swap instead (README step 2).
as_app env NODE_OPTIONS=--max-old-space-size=1536 npm run build

cp deploy/ravenfall.service deploy/ravenfall-backup.service deploy/ravenfall-backup.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now ravenfall-backup.timer
systemctl enable ravenfall
systemctl restart ravenfall
sleep 2
systemctl --no-pager --lines=5 status ravenfall
echo
echo "Logs: journalctl -u ravenfall -f"
