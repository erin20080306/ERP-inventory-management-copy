#!/bin/sh
set -u

INTERVAL_HOURS="${BACKUP_INTERVAL_HOURS:-24}"
case "$INTERVAL_HOURS" in
  ''|*[!0-9]*) INTERVAL_HOURS=24 ;;
esac
if [ "$INTERVAL_HOURS" -lt 1 ]; then INTERVAL_HOURS=1; fi
INTERVAL_SECONDS=$((INTERVAL_HOURS * 3600))

echo "加密資料庫備份服務已啟動：每 ${INTERVAL_HOURS} 小時，保留 ${BACKUP_RETENTION_DAYS:-30} 日。"
while true; do
  if ./node_modules/.bin/tsx scripts/create-encrypted-backup.ts; then
    sleep "$INTERVAL_SECONDS"
  else
    echo "備份失敗，5 分鐘後重試。" >&2
    sleep 300
  fi
done
