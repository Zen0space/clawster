#!/usr/bin/env bash
# Clawster backup — pg_dump + media archive → optional rclone offsite
# Usage: ./scripts/backup.sh
# Required env: DATABASE_URL
# Optional env: RCLONE_DEST (e.g. "b2:clawster-backups")

set -euo pipefail

DATE=$(date +%Y-%m-%d)
BACKUP_DIR="/var/backups/clawster"
PG_DIR="$BACKUP_DIR/pg"
MEDIA_DIR_BACKUP="$BACKUP_DIR/media"
MEDIA_ROOT="${MEDIA_ROOT:-/app/data/media}"
RETENTION_DAYS=30

mkdir -p "$PG_DIR" "$MEDIA_DIR_BACKUP"

echo "[backup] Starting backup for $DATE"

# ── PostgreSQL ──────────────────────────────────────────────────────────────
PG_FILE="$PG_DIR/$DATE.sql.gz"
if [ -z "${DATABASE_URL:-}" ]; then
  echo "[backup] ERROR: DATABASE_URL is not set" >&2
  exit 1
fi
pg_dump "$DATABASE_URL" | gzip > "$PG_FILE"
echo "[backup] DB dump: $PG_FILE ($(du -sh "$PG_FILE" | cut -f1))"

# ── Media volume ────────────────────────────────────────────────────────────
MEDIA_FILE="$MEDIA_DIR_BACKUP/$DATE.tar.zst"
if [ -d "$MEDIA_ROOT" ]; then
  tar --zstd -cf "$MEDIA_FILE" -C "$(dirname "$MEDIA_ROOT")" "$(basename "$MEDIA_ROOT")"
  echo "[backup] Media archive: $MEDIA_FILE ($(du -sh "$MEDIA_FILE" | cut -f1))"
else
  echo "[backup] Media root not found at $MEDIA_ROOT, skipping"
fi

# ── Retention ───────────────────────────────────────────────────────────────
find "$PG_DIR" -name "*.sql.gz" -mtime +"$RETENTION_DAYS" -delete
find "$MEDIA_DIR_BACKUP" -name "*.tar.zst" -mtime +"$RETENTION_DAYS" -delete
echo "[backup] Pruned files older than $RETENTION_DAYS days"

# ── Offsite (rclone) ────────────────────────────────────────────────────────
if [ -n "${RCLONE_DEST:-}" ]; then
  rclone sync "$BACKUP_DIR" "$RCLONE_DEST" --progress
  echo "[backup] Synced to $RCLONE_DEST"
else
  echo "[backup] RCLONE_DEST not set — skipping offsite sync"
fi

echo "[backup] Done."
