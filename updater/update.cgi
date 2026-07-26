#!/bin/sh
set -u

IMAGE_REPOSITORY="ghcr.io/erin20080306/erp-inventory-management-copy"
DEFAULT_IMAGE="${IMAGE_REPOSITORY}:latest"
ENV_FILE="/workspace/.env.local"
COMPOSE_FILE="/workspace/docker-compose.local.yml"

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

read_env_image() {
  if [ ! -f "$ENV_FILE" ]; then printf '%s' "$DEFAULT_IMAGE"; return; fi
  value="$(sed -n 's/^ERP_IMAGE=//p' "$ENV_FILE" | tail -n 1)"
  printf '%s' "${value:-$DEFAULT_IMAGE}"
}

write_env_image() {
  value="$1"
  temporary="${ENV_FILE}.update.$$"
  if [ -f "$ENV_FILE" ]; then
    awk '!/^ERP_IMAGE=/' "$ENV_FILE" > "$temporary"
  else
    : > "$temporary"
  fi
  printf 'ERP_IMAGE=%s\n' "$value" >> "$temporary"
  chmod 600 "$temporary"
  mv "$temporary" "$ENV_FILE"
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

release_version="${HTTP_X_ERIN_RELEASE_VERSION:-}"
image_digest="$(printf '%s' "${HTTP_X_ERIN_IMAGE_DIGEST:-}" | tr 'A-F' 'a-f')"
if [ -n "$release_version" ]; then
  case "$release_version" in development) ;; *[!0-9a-fA-F]*) respond "400 Bad Request" '{"ok":false,"error":"版本識別格式錯誤"}' ;; esac
  if [ "$release_version" != "development" ]; then
    version_length="${#release_version}"
    if [ "$version_length" -lt 7 ] || [ "$version_length" -gt 64 ]; then
      respond "400 Bad Request" '{"ok":false,"error":"版本識別格式錯誤"}'
    fi
  fi
fi
if [ -n "$image_digest" ]; then
  case "$image_digest" in sha256:????????????????????????????????????????????????????????????????) ;; *) respond "400 Bad Request" '{"ok":false,"error":"映像 Digest 格式錯誤"}' ;; esac
  hex="${image_digest#sha256:}"
  case "$hex" in *[!0-9a-f]*) respond "400 Bad Request" '{"ok":false,"error":"映像 Digest 格式錯誤"}' ;; esac
fi

if ! mkdir /state/update.lock 2>/dev/null; then
  respond "409 Conflict" '{"ok":false,"error":"已有更新正在執行"}'
fi
trap 'rmdir /state/update.lock 2>/dev/null || true' EXIT INT TERM

compose="docker compose --env-file $ENV_FILE -p erinerp -f $COMPOSE_FILE"
old_env_image="$(read_env_image)"
target_image="$old_env_image"
update_mode="latest"
if [ -n "$image_digest" ]; then
  target_image="${IMAGE_REPOSITORY}@${image_digest}"
  update_mode="digest"
fi
old_image_id="$(docker inspect erinerp-app-1 --format '{{.Image}}' 2>/dev/null || true)"
old_version=""
if [ -n "$old_image_id" ]; then old_version="$(image_revision "$old_image_id")"; fi

if [ "$update_mode" = "digest" ]; then
  write_state "pulling" "正在依中央簽章下載艾琳 ERP 新版本" "$old_version" "$release_version"
  if ! docker pull "$target_image" >/state/update.log 2>&1; then
    write_state "failed" "新版映像下載失敗，現有系統未變更" "$old_version" "$release_version"
    respond "502 Bad Gateway" '{"ok":false,"error":"新版映像下載失敗"}'
  fi
else
  write_state "pulling" "正在下載艾琳 ERP 新版本" "$old_version" "$release_version"
  if ! sh -c "$compose pull app backup" >/state/update.log 2>&1; then
    write_state "failed" "新版映像下載失敗，現有系統未變更" "$old_version" "$release_version"
    respond "502 Bad Gateway" '{"ok":false,"error":"新版映像下載失敗"}'
  fi
fi

new_image_id="$(docker image inspect "$target_image" --format '{{.Id}}' 2>/dev/null || true)"
new_version=""
if [ -n "$new_image_id" ]; then new_version="$(image_revision "$new_image_id")"; fi
if [ -z "$new_image_id" ]; then
  write_state "failed" "找不到已下載的新版映像，現有系統未變更" "$old_version" "$release_version"
  respond "502 Bad Gateway" '{"ok":false,"error":"找不到已下載的新版映像"}'
fi
if [ "$update_mode" = "digest" ] && [ -n "$release_version" ] && [ "$release_version" != "development" ] && [ "$new_version" != "$release_version" ]; then
  write_state "failed" "映像版本與中央簽章不一致，已拒絕更新" "$old_version" "$release_version"
  respond "409 Conflict" '{"ok":false,"error":"映像版本與中央簽章不一致"}'
fi

if [ -n "$old_image_id" ] && [ "$old_image_id" = "$new_image_id" ]; then
  if [ "$update_mode" = "digest" ]; then write_env_image "$target_image"; fi
  write_state "current" "目前已是最新版本" "$old_version" "${release_version:-$new_version}"
  respond "200 OK" '{"ok":true,"changed":false}'
fi

if [ "$update_mode" = "digest" ]; then
  write_env_image "$target_image"
  export ERP_IMAGE="$target_image"
fi
write_state "restarting" "備份完成，正在套用新版並重新啟動" "$old_version" "${release_version:-$new_version}"
if sh -c "$compose up -d --no-deps --force-recreate app backup" >>/state/update.log 2>&1 && wait_for_app; then
  write_state "healthy" "更新完成，健康檢查已通過" "$old_version" "${release_version:-$new_version}"
  respond "200 OK" '{"ok":true,"changed":true}'
fi

write_state "rolling_back" "新版健康檢查失敗，正在自動切回舊版" "$old_version" "${release_version:-$new_version}"
if [ "$update_mode" = "digest" ]; then
  write_env_image "$old_env_image"
  export ERP_IMAGE="$old_env_image"
  rollback_ok=false
  if sh -c "$compose up -d --no-deps --force-recreate app backup" >>/state/update.log 2>&1 && wait_for_app; then rollback_ok=true; fi
else
  rollback_ok=false
  if [ -n "$old_image_id" ] \
    && docker image tag "$old_image_id" "$target_image" >>/state/update.log 2>&1 \
    && sh -c "$compose up -d --no-deps --force-recreate app backup" >>/state/update.log 2>&1 \
    && wait_for_app; then rollback_ok=true; fi
fi

if [ "$rollback_ok" = "true" ]; then
  write_state "rolled_back" "新版未通過健康檢查，已自動恢復舊版；資料與備份均保留" "$old_version" "${release_version:-$new_version}"
  respond "500 Internal Server Error" '{"ok":false,"rolledBack":true,"error":"新版健康檢查失敗，已恢復舊版"}'
fi

write_state "failed" "更新與自動回復均未通過健康檢查，請聯絡艾琳設計；資料備份已保留" "$old_version" "${release_version:-$new_version}"
respond "500 Internal Server Error" '{"ok":false,"error":"更新後健康檢查失敗"}'
