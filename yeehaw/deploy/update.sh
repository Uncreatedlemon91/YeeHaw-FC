#!/usr/bin/env bash
# Build and (re)start YeeHaw FC. Run on the droplet after a git pull:
#   sudo bash /opt/yeehaw/yeehaw/deploy/update.sh
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
    echo "Run me with sudo." >&2
    exit 1
fi

APP=/opt/yeehaw/yeehaw
cd "$APP"
# Prisma and Next both read .env from the app directory themselves.
as_app() { sudo -u yeehaw -H "$@"; }

# Uploaded images live outside the checkout so a deploy never touches them.
# Honour UPLOAD_DIR from .env, else the default.
UPLOADS=$(sed -n 's/^UPLOAD_DIR=//p' .env 2>/dev/null | tail -n1 | tr -d "\"'")
install -d -o yeehaw -g yeehaw -m 750 "${UPLOADS:-/opt/yeehaw/uploads}"

echo "== Installing dependencies"
as_app npm ci --no-audit --no-fund
echo "== Applying database migrations"
as_app npx prisma migrate deploy
echo "== Building (takes a few minutes on a small droplet)"
# On a 1 GB droplet Node defaults to a ~256 MB heap, which the type-check
# step outgrows. Let the build use swap instead (README step 2).
as_app env NODE_OPTIONS=--max-old-space-size=1536 npm run build

cp deploy/yeehaw.service deploy/yeehaw-gateway.service deploy/yeehaw-backup.service deploy/yeehaw-backup.timer \
   deploy/yeehaw-season-job.service deploy/yeehaw-season-job.timer \
   deploy/yeehaw-notify.service deploy/yeehaw-notify.timer \
   deploy/yeehaw-ea-poll.service deploy/yeehaw-ea-poll.timer \
   deploy/yeehaw-article.service deploy/yeehaw-article.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now yeehaw-backup.timer yeehaw-season-job.timer yeehaw-notify.timer yeehaw-ea-poll.timer yeehaw-article.timer
systemctl enable yeehaw yeehaw-gateway
systemctl restart yeehaw
systemctl restart yeehaw-gateway
sleep 3
systemctl --no-pager --lines=5 status yeehaw yeehaw-gateway || true
echo
echo "Logs: journalctl -u yeehaw -f"
echo "      journalctl -u yeehaw-gateway -f"
echo "      journalctl -u yeehaw-notify       (the hourly notify job: recurring events, reminders; run now: systemctl start yeehaw-notify)"
echo "      journalctl -u yeehaw-ea-poll      (the hourly EA poll; run now: systemctl start yeehaw-ea-poll)"
echo "      journalctl -u yeehaw-article      (the AI roundup, daily 09:15 Eastern, publishes every ROUNDUP_DAYS; preview: sudo -u yeehaw npm run article:job -- --dry-run)"
echo "      journalctl -u yeehaw-season-job   (the daily season job; run now: systemctl start yeehaw-season-job)"
