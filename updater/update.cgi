#!/bin/sh
set -u

json_escape() {
  printf '%s' "$1" | tr '\r\n' '  ' | sed 's/\\/\\\\/g; s/"/\\"/g'
}

respond() {
  status="$1"
  body="$2"
  printf 'Status: %s\r\nContent-Type: application/json; charset=utf-8\r\nCache-Control: no-store\r\n\r\n%s\n' "$status" "$body"
  exit 0
}

write_state() {
  state="$1"
  message="$2"
  from_version="${3:-}"
  to_version="${4:-}"
  now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  temporary="/state/status.json.tmp.$$"
  printf '{"state":"%s","message":"%s","fromVersion":"%s","toVersion":"%s","updatedAt":"%s"}\n' \
    "$(json_escape "$state")" "$(json_escape "$message")" "$(json_escape "$from_version")" "$(json_escape "$to_version")" "$now" > "$temporary"
  mv "$temporary" /state/status.json
}

image_revision() {
  docker image inspect "$1" --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' 2>/dev/null || true
}

wait_for_app() {
  attempt=0
  while [ "$attempt" -lt 90 ]; do
    if wget -q -T 4 -O /dev/null http://app:3000/login 2>/dev/null; then return 0; fi
    attempt=$((attempt + 1))
    sleep 2
  done
  return 1
}

if [ "${REQUEST_METHOD:-}" != "POST" ]; then
  respond "405 Method Not Allowed" '{"ok":false,"error":"只接受 POST"}'
fi

expected="Bearer ${HOST_UPDATE_TOKEN:-}"
if [ -z "${HOST_UPDATE_TOKEN:-}" ] || [ "${HTTP_AUTHORIZATION:-}" != "$expected" ]; then
  respond "403 Forbidden" '{"ok":false,"error":"更新權杖無效"}'
fi

if ! mkdir /state/update.lock 2>/dev/null; then
  respond "409 Conflict" '{"ok":false,"error":"已有更新正在執行"}'
fi
trap 'rmdir /state/update.lock 2>/dev/null || true' EXIT INT TERM

compose="docker compose --env-file /workspace/.env.local -p erinerp -f /workspace/docker-compose.local.yml"
erp_image="${ERP_IMAGE:-ghcr.io/erin20080306/erp-inventory-management-copy:latest}"
old_image_id="$(docker inspect erinerp-app-1 --format '{{.Image}}' 2>/dev/null || true)"
old_version=""
if [ -n "$old_image_id" ]; then old_version="$(image_revision "$old_image_id")"; fi

write_state "pulling" "正在下載艾琳 ERP 新版本" "$old_version" ""
if ! sh -c "$compose pull app backup" >/state/update.log 2>&1; then
  write_state "failed" "新版映像下載失敗，現有系統未變更" "$old_version" ""
  respond "502 Bad Gateway" '{"ok":false,"error":"新版映像下載失敗"}'
fi

new_image_id="$(docker image inspect "$erp_image" --format '{{.Id}}' 2>/dev/null || true)"
new_version=""
if [ -n "$new_image_id" ]; then new_version="$(image_revision "$new_image_id")"; fi
if [ -z "$new_image_id" ]; then
  write_state "failed" "找不到已下載的新版映像，現有系統未變更" "$old_version" ""
  respond "502 Bad Gateway" '{"ok":false,"error":"找不到已下載的新版映像"}'
fi

if [ -n "$old_image_id" ] && [ "$old_image_id" = "$new_image_id" ]; then
  write_state "current" "目前已是最新版本" "$old_version" "$new_version"
  respond "200 OK" '{"ok":true,"changed":false}'
fi

write_state "restarting" "備份完成，正在套用新版並重新啟動" "$old_version" "$new_version"
if sh -c "$compose up -d --no-deps --force-recreate app backup" >>/state/update.log 2>&1 && wait_for_app; then
  write_state "healthy" "更新完成，健康檢查已通過" "$old_version" "$new_version"
  respond "200 OK" '{"ok":true,"changed":true}'
fi

if [ -n "$old_image_id" ]; then
  write_state "rolling_back" "新版健康檢查失敗，正在自動切回舊版" "$old_version" "$new_version"
  if docker image tag "$old_image_id" "$erp_image" >>/state/update.log 2>&1 \
    && sh -c "$compose up -d --no-deps --force-recreate app backup" >>/state/update.log 2>&1 \
    && wait_for_app; then
    write_state "rolled_back" "新版未通過健康檢查，已自動恢復舊版；資料與備份均保留" "$old_version" "$new_version"
    respond "500 Internal Server Error" '{"ok":false,"rolledBack":true,"error":"新版健康檢查失敗，已恢復舊版"}'
  fi
fi

write_state "failed" "更新與自動回復均未通過健康檢查，請聯絡艾琳設計；資料備份已保留" "$old_version" "$new_version"
respond "500 Internal Server Error" '{"ok":false,"error":"更新後健康檢查失敗"}'
