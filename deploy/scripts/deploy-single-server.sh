#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${APP_ROOT:-/var/www/duanxian}"
FRONTEND_DIR="$APP_ROOT/frontend"
BACKEND_DIR="$APP_ROOT/backend"

echo "[1/5] Build frontend"
cd "$FRONTEND_DIR"
npm ci
npm run build

echo "[2/5] Install backend dependencies"
cd "$BACKEND_DIR"
npm ci --omit=dev

if [ ! -f ".env" ] && [ -f ".env.example" ]; then
  cp .env.example .env
  echo ".env created from .env.example, please review it."
fi

echo "[3/5] Ensure data directory exists"
mkdir -p "$BACKEND_DIR/data"
mkdir -p "$BACKEND_DIR/logs"

echo "[4/5] Restart backend with PM2"
pm2 startOrReload "$BACKEND_DIR/ecosystem.config.cjs"
pm2 save

echo "[5/5] Deployment complete"
echo "Remember to reload nginx after updating its site config."
