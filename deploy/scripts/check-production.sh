#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:8080}"
SITE_URL="${SITE_URL:-}"

check_url() {
  local url="$1"
  local label="$2"
  local status
  status="$(curl -L -s -o /dev/null -w "%{http_code}" "$url")"

  if [ "$status" -lt 200 ] || [ "$status" -ge 400 ]; then
    echo "FAIL $label $url HTTP $status"
    exit 1
  fi

  echo "OK   $label $url HTTP $status"
}

check_url "$BASE_URL/api/health" "api health"
check_url "$BASE_URL/api/home" "home api"
check_url "$BASE_URL/api/ztlive" "ztlive api"
check_url "$BASE_URL/api/lianban" "lianban api"
check_url "$BASE_URL/api/jingjia" "jingjia api"
check_url "$BASE_URL/api/zijin" "zijin api"
check_url "$BASE_URL/api/fupan" "fupan api"
check_url "$BASE_URL/api/kline/600519" "kline sample api"

if [ -n "$SITE_URL" ]; then
  check_url "$SITE_URL" "frontend"
  check_url "$SITE_URL/status" "status page"
  check_url "$SITE_URL/ztlive" "ztlive page"
  check_url "$SITE_URL/about" "about page"
fi

if command -v pm2 >/dev/null 2>&1; then
  pm2 describe duanxian-api >/dev/null
  echo "OK   pm2 process duanxian-api"
fi

echo "Production check passed"
