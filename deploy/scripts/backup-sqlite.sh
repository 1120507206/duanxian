#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${APP_ROOT:-/var/www/duanxian}"
DB_PATH="${DB_PATH:-$APP_ROOT/backend/data/duanxian.db}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/duanxian}"
KEEP_DAYS="${KEEP_DAYS:-7}"
STAMP="$(date +%F-%H%M%S)"
BACKUP_FILE="$BACKUP_DIR/duanxian-$STAMP.db"

mkdir -p "$BACKUP_DIR"

if ! command -v sqlite3 >/dev/null 2>&1; then
  echo "sqlite3 is required for hot backup"
  exit 1
fi

sqlite3 "$DB_PATH" "PRAGMA wal_checkpoint(FULL);"
sqlite3 "$DB_PATH" ".backup '$BACKUP_FILE'"

find "$BACKUP_DIR" -type f -name 'duanxian-*.db' -mtime +"$KEEP_DAYS" -delete

echo "Backup created: $BACKUP_FILE"
