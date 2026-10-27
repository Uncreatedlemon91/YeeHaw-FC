#!/usr/bin/env bash
# Daily pg_dump of the Ravenfall database, keeping the newest $KEEP.
# Run by ravenfall-backup.timer; run by hand with:
#   sudo -u ravenfall bash /opt/ravenfall/ravenfall/deploy/backup.sh
# Also archives the library image directory (LIBRARY_UPLOAD_DIR). Restore with:
#   gunzip -c FILE.sql.gz | sudo -u ravenfall psql ravenfall
#   sudo -u ravenfall tar -xzf ravenfall-uploads-XXXX.tar.gz -C "$(dirname "$LIBRARY_UPLOAD_DIR")"
set -euo pipefail

DIR="${BACKUP_DIR:-/opt/ravenfall/backups}"
KEEP="${BACKUP_RETENTION:-14}"
UPLOADS="${LIBRARY_UPLOAD_DIR:-/opt/ravenfall/uploads/library}"
mkdir -p "$DIR"

out="$DIR/ravenfall-$(date -u +%Y%m%d-%H%M%S).sql.gz"
# Peer auth over the local socket: the ravenfall OS user is the DB owner.
pg_dump --no-owner --clean --if-exists ravenfall | gzip > "$out.tmp"
mv "$out.tmp" "$out"
echo "Wrote $out ($(du -h "$out" | cut -f1))"

ls -1t "$DIR"/ravenfall-*.sql.gz | tail -n +"$((KEEP + 1))" | xargs -r rm --

# Library images live on disk, not in the database. Stored relative to the
# directory's parent so a restore can extract it anywhere.
if [[ -d "$UPLOADS" ]]; then
    up="$DIR/ravenfall-uploads-$(date -u +%Y%m%d-%H%M%S).tar.gz"
    tar -czf "$up.tmp" -C "$(dirname "$UPLOADS")" "$(basename "$UPLOADS")"
    mv "$up.tmp" "$up"
    echo "Wrote $up ($(du -h "$up" | cut -f1))"
    ls -1t "$DIR"/ravenfall-uploads-*.tar.gz | tail -n +"$((KEEP + 1))" | xargs -r rm --
fi
