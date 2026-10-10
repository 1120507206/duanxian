#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${APP_ROOT:-/var/www/duanxian}"
DB_PATH="${DB_PATH:-$APP_ROOT/backend/data/duanxian.db}"
BACKUP_FILE="${1:-}"

if [ -z "$BACKUP_FILE" ]; then
  echo "Usage: $0 /path/to/backup.db"
  exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
  echo "Backup file not found: $BACKUP_FILE"
  exit 1
fi

mkdir -p "$(dirname "$DB_PATH")"

if command -v pm2 >/dev/null 2>&1; then
  pm2 stop duanxian-api || true
fi

STAMP="$(date +%F-%H%M%S)"
if [ -f "$DB_PATH" ]; then
  cp "$DB_PATH" "$DB_PATH.before-restore-$STAMP"
fi

cp "$BACKUP_FILE" "$DB_PATH"
rm -f "$DB_PATH-shm" "$DB_PATH-wal"

if command -v pm2 >/dev/null 2>&1; then
  pm2 start duanxian-api || pm2 start "$APP_ROOT/backend/ecosystem.config.cjs"
fi

echo "Database restored from: $BACKUP_FILE"
