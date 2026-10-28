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

# Optional off-box copy: BACKUP_REMOTE is an rclone target such as
# "spaces:yeehaw-backups" (apt install rclone; rclone config, as the yeehaw user).
# A lost droplet takes its own backups with it, so keep one copy elsewhere.
if [[ -n "${BACKUP_REMOTE:-}" ]]; then
    if command -v rclone >/dev/null; then
        rclone copy "$out" "$BACKUP_REMOTE" && echo "Copied $(basename "$out") to $BACKUP_REMOTE"
        [[ -n "${up:-}" ]] && rclone copy "$up" "$BACKUP_REMOTE" && echo "Copied $(basename "$up") to $BACKUP_REMOTE"
    else
        echo "BACKUP_REMOTE is set but rclone is not installed; no off-box copy." >&2
    fi
fi
