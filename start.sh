#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$APP_ROOT/backend"
FRONTEND_DIR="$APP_ROOT/frontend"
HEALTH_URL="http://127.0.0.1:8080/api/health"

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm use 22 > /dev/null 2>&1 || true

NODE_MAJOR="$(node -p 'Number(process.versions.node.split(".")[0])' 2>/dev/null || echo 0)"
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "需要 Node.js 22+（当前 $(node -v 2>/dev/null || echo 未安装)）。"
  echo "封板事件流依赖 Node 内置 WebSocket，低版本会静默降级为纯轮询。"
  exit 1
fi

echo "=== 拉取最新代码 ==="
cd "$APP_ROOT"

if [ -n "$(git status --porcelain)" ]; then
  echo "工作区有未提交的改动，为避免覆盖丢失，停止拉取。请先在服务器上处理："
  git status --short
  exit 1
fi

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
REMOTE="$(git config --get "branch.$BRANCH.remote" 2>/dev/null || echo origin)"
echo "从 $REMOTE 拉取分支 $BRANCH ..."
git pull --ff-only "$REMOTE" "$BRANCH"
git log -1 --oneline

echo "=== 启动 / 重启后端服务 ==="
cd "$BACKEND_DIR"
export NODE_ENV=production

if command -v pm2 >/dev/null 2>&1; then
  if ss -tlnp | grep -q ':8080 ' && ! pm2 describe duanxian-api >/dev/null 2>&1; then
    echo "8080 被一个非 PM2 进程占用，PM2 无法接管。"
    echo "请先停掉旧进程（例如 pkill -f 'node src/index.js'）后重试。"
    exit 1
  fi
  # startOrReload 保证拉取的新代码一定被加载，不会出现「代码更新了但进程还是旧的」
  pm2 startOrReload "$BACKEND_DIR/ecosystem.config.cjs"
  pm2 save
else
  if ss -tlnp | grep -q ':8080 '; then
    echo "8080 已被占用，但未安装 PM2。请先停掉旧进程（例如 pkill -f 'node src/index.js'）后重试。"
    exit 1
  fi
  nohup npm start > /tmp/duanxian-backend.log 2>&1 &
fi

echo "=== 等待后端健康检查 ==="
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
  echo "后端健康检查失败：$HEALTH_URL"
  if command -v pm2 >/dev/null 2>&1; then
    pm2 logs duanxian-api --lines 50 --nostream || true
  else
    tail -n 50 /tmp/duanxian-backend.log || true
  fi
  exit 1
fi
echo "后端健康检查通过"

echo "=== 构建前端 ==="
cd "$FRONTEND_DIR"
npm run build

echo "=== 重载 Nginx ==="
sudo -n nginx -t && sudo -n systemctl reload nginx

echo "=== 启动完成 ==="
echo "后端: http://127.0.0.1:8080"
echo "前端: http://www.duanxian.site"
