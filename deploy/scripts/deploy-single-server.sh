#!/usr/bin/env bash
set -euo pipefail

# 从脚本位置推导仓库根目录。CI 可能把仓库放在 /home/ubuntu/duanxian，
# 手动部署可能是 /var/www/duanxian —— 两边都不需要再额外设置 APP_ROOT。
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_APP_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
APP_ROOT="${APP_ROOT:-$DEFAULT_APP_ROOT}"
FRONTEND_DIR="$APP_ROOT/frontend"
BACKEND_DIR="$APP_ROOT/backend"
HEALTH_URL="http://127.0.0.1:8080/api/health"

NODE_MAJOR="$(node -p 'Number(process.versions.node.split(".")[0])')"
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "Node.js 22+ is required (current: $(node -v))."
  echo "封板事件流依赖 Node 内置 WebSocket，低版本会静默降级。请先升级 Node 后重试。"
  exit 1
fi

if [ -f "$BACKEND_DIR/data/duanxian.db" ] && command -v sqlite3 >/dev/null 2>&1; then
  echo "[0/6] Backup SQLite before deploy"
  APP_ROOT="$APP_ROOT" "$SCRIPT_DIR/backup-sqlite.sh"
else
  echo "[0/6] Skip pre-deploy backup (database or sqlite3 not present)"
fi

echo "[1/6] Build frontend"
cd "$FRONTEND_DIR"
npm ci
npm run build

echo "[2/6] Install backend dependencies"
cd "$BACKEND_DIR"
npm ci --omit=dev

if [ ! -f ".env" ] && [ -f ".env.example" ]; then
  cp .env.example .env
  echo ".env created from .env.example. Review it before the first production start."
fi

echo "[3/6] Ensure data directory exists"
mkdir -p "$BACKEND_DIR/data"
mkdir -p "$BACKEND_DIR/logs"

echo "[4/6] Restart backend with PM2"
pm2 startOrReload "$BACKEND_DIR/ecosystem.config.cjs"
pm2 save

echo "[5/6] Wait for backend health"
healthy=0
for attempt in $(seq 1 30); do
  if body="$(curl -fsS "$HEALTH_URL" 2>/dev/null)" \
    && printf '%s' "$body" | grep -q '"status":"ok"'; then
    healthy=1
    break
  fi
  sleep 1
done

if [ "$healthy" -ne 1 ]; then
  echo "Backend health check failed after 30s: $HEALTH_URL"
  pm2 logs duanxian-api --lines 50 --nostream || true
  exit 1
fi
echo "Backend healthy: $HEALTH_URL"

if ! curl -fsS "http://127.0.0.1:8080/api/ztlive/stream/status" >/dev/null; then
  echo "Realtime status endpoint failed: /api/ztlive/stream/status"
  exit 1
fi
echo "Realtime status endpoint OK"

echo "[6/6] Deployment complete"
echo "Remember to reload nginx after updating its site config."
