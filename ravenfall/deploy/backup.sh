#!/usr/bin/env bash
# Daily pg_dump of the Ravenfall database, keeping the newest $KEEP.
# Run by ravenfall-backup.timer; run by hand with:
#   sudo -u ravenfall bash /opt/ravenfall/ravenfall/deploy/backup.sh
# Restore with:
#   gunzip -c FILE.sql.gz | sudo -u ravenfall psql ravenfall
set -euo pipefail

DIR="${BACKUP_DIR:-/opt/ravenfall/backups}"
KEEP="${BACKUP_RETENTION:-14}"
mkdir -p "$DIR"

out="$DIR/ravenfall-$(date -u +%Y%m%d-%H%M%S).sql.gz"
# Peer auth over the local socket: the ravenfall OS user is the DB owner.
pg_dump --no-owner --clean --if-exists ravenfall | gzip > "$out.tmp"
mv "$out.tmp" "$out"
echo "Wrote $out ($(du -h "$out" | cut -f1))"

ls -1t "$DIR"/ravenfall-*.sql.gz | tail -n +"$((KEEP + 1))" | xargs -r rm --
