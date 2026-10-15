#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$APP_ROOT/backend"
FRONTEND_DIR="$APP_ROOT/frontend"

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm use 22 > /dev/null 2>&1

echo "=== 启动后端服务 ==="
cd "$BACKEND_DIR"

# 检查是否已在运行
if ss -tlnp | grep -q ':8080 '; then
  echo "后端已在 8080 端口运行，跳过启动"
else
  nohup npm start > /tmp/duanxian-backend.log 2>&1 &
  sleep 2
  if ss -tlnp | grep -q ':8080 '; then
    echo "后端启动成功 (端口 8080)"
  else
    echo "后端启动失败，请查看日志: /tmp/duanxian-backend.log"
    exit 1
  fi
fi

echo "=== 构建前端 ==="
cd "$FRONTEND_DIR"
npm run build

echo "=== 重载 Nginx ==="
sudo -n nginx -t && sudo -n systemctl reload nginx

echo "=== 启动完成 ==="
echo "后端: http://127.0.0.1:8080"
echo "前端: http://www.duanxian.site"
