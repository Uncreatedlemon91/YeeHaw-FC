#!/usr/bin/env bash
# Daily pg_dump of the YeeHaw database, keeping the newest $KEEP.
# Run by yeehaw-backup.timer; run by hand with:
#   sudo -u yeehaw bash /opt/yeehaw/yeehaw/deploy/backup.sh
# Also archives the uploads directory (UPLOAD_DIR). Restore with:
#   gunzip -c FILE.sql.gz | sudo -u yeehaw psql yeehaw
#   sudo -u yeehaw tar -xzf yeehaw-uploads-XXXX.tar.gz -C "$(dirname "$UPLOAD_DIR")"
set -euo pipefail

DIR="${BACKUP_DIR:-/opt/yeehaw/backups}"
KEEP="${BACKUP_RETENTION:-14}"
UPLOADS="${UPLOAD_DIR:-/opt/yeehaw/uploads}"
mkdir -p "$DIR"

out="$DIR/yeehaw-$(date -u +%Y%m%d-%H%M%S).sql.gz"
# Peer auth over the local socket: the yeehaw OS user is the DB owner.
pg_dump --no-owner --clean --if-exists yeehaw | gzip > "$out.tmp"
mv "$out.tmp" "$out"
echo "Wrote $out ($(du -h "$out" | cut -f1))"

ls -1t "$DIR"/yeehaw-*.sql.gz | tail -n +"$((KEEP + 1))" | xargs -r rm --

# Uploaded images live on disk, not in the database. Stored relative to the
# directory's parent so a restore can extract it anywhere.
if [[ -d "$UPLOADS" ]]; then
    up="$DIR/yeehaw-uploads-$(date -u +%Y%m%d-%H%M%S).tar.gz"
    tar -czf "$up.tmp" -C "$(dirname "$UPLOADS")" "$(basename "$UPLOADS")"
    mv "$up.tmp" "$up"
    echo "Wrote $up ($(du -h "$up" | cut -f1))"
    ls -1t "$DIR"/yeehaw-uploads-*.tar.gz | tail -n +"$((KEEP + 1))" | xargs -r rm --
fi
