#!/usr/bin/env bash
# Clawster restore — restores DB and media from a backup date
# Usage: ./scripts/restore.sh 2026-04-21
# Required env: DATABASE_URL

set -euo pipefail

DATE="${1:-}"
if [ -z "$DATE" ]; then
  echo "Usage: $0 YYYY-MM-DD" >&2
  exit 1
fi

BACKUP_DIR="/var/backups/clawster"
PG_FILE="$BACKUP_DIR/pg/$DATE.sql.gz"
MEDIA_FILE="$BACKUP_DIR/media/$DATE.tar.zst"
MEDIA_ROOT="${MEDIA_ROOT:-/app/data/media}"

if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: DATABASE_URL is not set" >&2
  exit 1
fi

echo "[restore] Restoring from $DATE"

# ── PostgreSQL ──────────────────────────────────────────────────────────────
if [ ! -f "$PG_FILE" ]; then
  echo "[restore] ERROR: $PG_FILE not found" >&2
  exit 1
fi
echo "[restore] Restoring DB from $PG_FILE..."
gunzip -c "$PG_FILE" | psql "$DATABASE_URL"
echo "[restore] DB restore complete"

# ── Media volume ────────────────────────────────────────────────────────────
if [ -f "$MEDIA_FILE" ]; then
  echo "[restore] Restoring media from $MEDIA_FILE..."
  mkdir -p "$(dirname "$MEDIA_ROOT")"
  tar --zstd -xf "$MEDIA_FILE" -C "$(dirname "$MEDIA_ROOT")"
  echo "[restore] Media restore complete"
else
  echo "[restore] No media archive for $DATE, skipping"
fi

echo "[restore] Done. Restart the backend to apply."
