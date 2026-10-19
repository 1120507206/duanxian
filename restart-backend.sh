#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$APP_ROOT/backend"
LOG_FILE="/tmp/duanxian-backend.log"

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm use 22 > /dev/null 2>&1

echo "=== 重启后端服务 ==="

# 停止旧进程
OLD_PID=$(ss -tlnp | grep ':8080 ' | sed -n 's/.*pid=\([0-9]*\).*/\1/p' | head -1)
if [ -n "$OLD_PID" ]; then
  echo "停止旧进程 (PID: $OLD_PID)..."
  kill "$OLD_PID" 2>/dev/null
  sleep 1
  echo "已停止"
else
  echo "未检测到运行中的后端进程"
fi

# 启动新进程
cd "$BACKEND_DIR"
echo "启动新后端..."
nohup npm start > "$LOG_FILE" 2>&1 &
sleep 3

# 验证
if ss -tlnp | grep -q ':8080 '; then
  echo "✅ 后端重启成功 (端口 8080)"
  echo "日志: $LOG_FILE"
  tail -3 "$LOG_FILE"
else
  echo "❌ 后端启动失败，请查看日志: $LOG_FILE"
  exit 1
fi
