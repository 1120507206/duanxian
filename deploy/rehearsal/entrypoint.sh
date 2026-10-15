#!/usr/bin/env bash
set -euo pipefail

# 用真实发布脚本完成构建与 PM2 启动，避免演练环境和线上流程分叉
/var/www/duanxian/deploy/scripts/deploy-single-server.sh

nginx
sleep 2

echo "=== node/npm/pm2 ==="
node -v && npm -v && pm2 -v
echo "=== native module platform check ==="
find /var/www/duanxian/backend/node_modules/better-sqlite3 -name '*.node' -exec file {} \;
echo "=== database bootstrap ==="
ls -la /var/www/duanxian/backend/data

exec tail -F /var/www/duanxian/backend/logs/out.log /var/log/nginx/error.log
