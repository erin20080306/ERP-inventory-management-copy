#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PACKAGE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
INSTALL_DIR="$HOME/ErinERP"
DEVICE_DIR="$HOME/Library/Application Support/ErinERP"
BACKUP_DIR="$HOME/ErinERP-Backups"
CENTRAL_URL="https://erp-inventory-management-copy.vercel.app"
DOCKER_DOCS_URL="https://docs.docker.com/desktop/setup/install/mac-install/"
IMAGE_TAG="latest"
DOCKER_BIN=""
if [ -f "$PACKAGE_DIR/image-tag.txt" ]; then IMAGE_TAG="$(tr -d '\r\n' < "$PACKAGE_DIR/image-tag.txt")"; fi
ERP_IMAGE="ghcr.io/erin20080306/erp-inventory-management-copy:$IMAGE_TAG"

pause_exit() {
  echo ""
  read -r -p "按 Enter 結束…" || true
  exit "${1:-1}"
}

valid_ipv4() {
  local first second third fourth extra octet
  IFS=. read -r first second third fourth extra <<< "$1"
  [ -z "$extra" ] || return 1
  for octet in "$first" "$second" "$third" "$fourth"; do
    case "$octet" in
      ''|*[!0-9]*) return 1 ;;
    esac
    [ "$octet" -le 255 ] || return 1
  done
  return 0
}

detect_lan_ip() {
  local interface candidate
  interface="$(route -n get default 2>/dev/null | awk '/interface:/{print $2; exit}')"
  if [ -n "$interface" ]; then
    candidate="$(ipconfig getifaddr "$interface" 2>/dev/null || true)"
    if valid_ipv4 "$candidate" && [[ "$candidate" != 127.* ]] && [[ "$candidate" != 169.254.* ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  fi

  for interface in $(ifconfig -l 2>/dev/null); do
    case "$interface" in
      lo0|utun*|awdl*|llw*|bridge*|vmenet*) continue ;;
    esac
    candidate="$(ipconfig getifaddr "$interface" 2>/dev/null || true)"
    if valid_ipv4 "$candidate" && [[ "$candidate" != 127.* ]] && [[ "$candidate" != 169.254.* ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  return 1
}

resolve_lan_ip() {
  local detected entered
  detected="$(detect_lan_ip || true)"
  if [ -n "$detected" ]; then
    printf '%s\n' "$detected"
    return 0
  fi

  echo "無法自動偵測可供工作站連線的區網 IPv4。" >&2
  echo "請到『系統設定 → 網路 → 目前連線』查看 IP，例如 192.168.1.20。" >&2
  read -r -p "請輸入這台 Mac 的區網 IPv4：" entered
  if ! valid_ipv4 "$entered" || [[ "$entered" == 127.* ]] || [[ "$entered" == 169.254.* ]]; then
    echo "IP 格式不正確，請重新執行安裝程式。" >&2
    return 1
  fi
  printf '%s\n' "$entered"
}

resolve_docker() {
  local candidate
  if command -v docker >/dev/null 2>&1; then
    DOCKER_BIN="$(command -v docker)"
    return 0
  fi
  for candidate in \
    "/Applications/Docker.app/Contents/Resources/bin/docker" \
    "/usr/local/bin/docker" \
    "/opt/homebrew/bin/docker" \
    "$HOME/.docker/bin/docker"; do
    if [ -x "$candidate" ]; then
      DOCKER_BIN="$candidate"
      return 0
    fi
  done
  return 1
}

docker_ready() {
  resolve_docker || return 1
  "$DOCKER_BIN" info >/dev/null 2>&1
}

wait_for_docker() {
  echo "等待 Docker Desktop 啟動…"
  echo "第一次啟動時，請在 Docker 視窗接受條款並完成系統權限設定。"
  for _ in $(seq 1 100); do
    if docker_ready; then
      echo "Docker Desktop 已就緒。"
      return 0
    fi
    sleep 3
  done
  return 1
}

docker_download_label() {
  case "$(uname -m)" in
    arm64) printf '%s\n' "Mac with Apple silicon" ;;
    x86_64) printf '%s\n' "Mac with Intel chip" ;;
    *) printf '%s\n' "適用於此 Mac 的版本" ;;
  esac
}

ensure_docker() {
  local docker_label
  if docker_ready; then return 0; fi

  if [ -d "/Applications/Docker.app" ]; then
    echo "已找到 Docker Desktop，正在自動開啟…"
    open -ga Docker >/dev/null 2>&1 || open "/Applications/Docker.app" >/dev/null 2>&1 || true
    if wait_for_docker; then return 0; fi
    echo "Docker Desktop 尚未完成啟動。請確認 Docker 視窗是否仍在等待接受條款或輸入 Mac 密碼。"
    pause_exit 1
  fi

  docker_label="$(docker_download_label)"
  echo ""
  echo "【尚缺一個必要程式：Docker Desktop】"
  echo "你下載的 ErinERP-Host ZIP 是艾琳 ERP 公司主機手動安裝包；Docker Desktop 是執行資料庫與主機服務的必要環境。"
  echo "這兩者是不同程式，因此 Host ZIP 不會把 Docker Desktop 重新包在裡面。"
  echo ""
  echo "即將開啟 Docker 官方安裝頁，請選『$docker_label』。"
  open "$DOCKER_DOCS_URL" >/dev/null 2>&1 || true
  echo "安裝步驟：下載 Docker.dmg → 拖到『應用程式』→ 開啟 Docker → 接受條款。"
  echo "完成後不必重新下載 Host ZIP；回到這個視窗按 Enter，安裝程式會再次檢查。"
  read -r -p "Docker Desktop 已安裝並開啟後，按 Enter 繼續…" || true

  if [ -d "/Applications/Docker.app" ]; then
    open -ga Docker >/dev/null 2>&1 || true
  fi
  if wait_for_docker; then return 0; fi

  echo "仍無法連線 Docker Desktop。請確認 Docker 上方選單顯示正在執行，再重新執行本安裝程式。"
  pause_exit 1
}

docker_cli() {
  "$DOCKER_BIN" "$@"
}

existing_env_value() {
  local key="$1"
  if [ -f "$INSTALL_DIR/.env.local" ]; then
    sed -n "s/^$key=//p" "$INSTALL_DIR/.env.local" | head -n 1
  fi
  return 0
}

show_startup_diagnostics() {
  local log_file="$INSTALL_DIR/startup-diagnostics.log"
  echo ""
  echo "【公司主機啟動診斷】"
  {
    echo "=== docker compose ps ==="
    docker_cli compose --env-file .env.local -f docker-compose.local.yml ps || true
    echo ""
    echo "=== postgres / app / caddy logs ==="
    docker_cli compose --env-file .env.local -f docker-compose.local.yml logs --no-color --tail=160 postgres app caddy || true
  } 2>&1 | tee "$log_file" || true
  echo ""
  echo "診斷記錄已儲存：$log_file"
}

pull_erp_image() {
  local log_file
  log_file="$(mktemp "${TMPDIR:-/tmp}/erin-erp-image-pull.XXXXXX")"
  echo "下載艾琳 ERP 公司主機映像：$ERP_IMAGE"
  if docker_cli pull "$ERP_IMAGE" 2>&1 | tee "$log_file"; then
    rm -f "$log_file"
    return 0
  fi

  echo ""
  if grep -Eqi "denied|unauthorized|forbidden" "$log_file"; then
    echo "【公司主機映像下載權限錯誤】"
    echo "Docker Desktop 已正常執行，但 GitHub Container Registry 拒絕下載艾琳 ERP 映像。"
    echo "這通常表示映像尚未發布，或 GHCR Package 尚未設為 Public；不是你的 Mac 或啟用碼錯誤。"
    echo "請將這個畫面提供給艾琳設計，待映像發布權限修正後，重新執行同一個 Host 安裝包即可。"
  else
    echo "【公司主機映像下載失敗】"
    echo "請確認網路連線正常，再重新執行同一個 Host 安裝包。"
  fi
  rm -f "$log_file"
  pause_exit 1
}

install_workstation_app() {
  local arch temp_dir mount_dir app_source app_target shortcut bootstrap_info download_url
  case "$(uname -m)" in
    arm64) arch="arm64" ;;
    x86_64) arch="x64" ;;
    *) echo "目前處理器尚未提供自動工作站安裝，略過桌面 App。"; return 0 ;;
  esac
  temp_dir="$(mktemp -d "${TMPDIR:-/tmp}/erin-erp-workstation.XXXXXX")"
  mount_dir="$temp_dir/mount"
  mkdir -p "$mount_dir" "$HOME/Applications"
  echo "下載並安裝艾琳 ERP 工作站與桌面圖示…"
  bootstrap_info="$(curl -fLsS -H "x-erin-activation-key: $ACTIVATION_KEY" \
    "$CENTRAL_URL/api/installers/bootstrap?platform=macos&arch=$arch&delivery=location" 2>/dev/null || true)"
  download_url="$(printf '%s' "$bootstrap_info" | sed -n 's/.*"downloadUrl":"\([^"]*\)".*/\1/p')"
  if [ -n "$download_url" ]; then
    curl -fLsS "$download_url" -o "$temp_dir/ErinERP.dmg" || download_url=""
  fi
  if [ -z "$download_url" ] && ! curl -fLsS -H "x-erin-activation-key: $ACTIVATION_KEY" \
    "$CENTRAL_URL/api/installers/bootstrap?platform=macos&arch=$arch" -o "$temp_dir/ErinERP.dmg"; then
    echo "工作站 App 暫時無法自動下載；公司主機不受影響，可稍後從 ERP 的『桌面版』下載。"
    rm -rf "$temp_dir"
    return 0
  fi
  if ! hdiutil attach -nobrowse -readonly -mountpoint "$mount_dir" "$temp_dir/ErinERP.dmg" >/dev/null; then
    echo "工作站 DMG 無法掛載；公司主機不受影響。"
    rm -rf "$temp_dir"
    return 0
  fi
  app_source="$(find "$mount_dir" -maxdepth 2 -type d -name '*.app' -print -quit)"
  app_target="$HOME/Applications/艾琳 ERP.app"
  shortcut="$HOME/Desktop/艾琳 ERP.app"
  if [ -n "$app_source" ]; then
    rm -rf "$app_target"
    ditto "$app_source" "$app_target"
    rm -f "$shortcut"
    ln -s "$app_target" "$shortcut"
    echo "已建立桌面『艾琳 ERP』圖示。"
  else
    echo "DMG 內找不到艾琳 ERP.app；公司主機不受影響。"
  fi
  hdiutil detach "$mount_dir" >/dev/null 2>&1 || true
  rm -rf "$temp_dir"
}

echo "艾琳 ERP 公司主機 macOS 手動安裝程式"
echo "同一台 Mac 可以同時安裝『公司主機』與『艾琳 ERP 工作站』。"
ensure_docker

read -r -p "輸入艾琳設計提供的啟用碼：" ACTIVATION_KEY
if [ ${#ACTIVATION_KEY} -lt 24 ]; then
  echo "啟用碼格式錯誤，請向艾琳設計確認。"
  pause_exit 1
fi

mkdir -p "$INSTALL_DIR" "$DEVICE_DIR" "$BACKUP_DIR" "$INSTALL_DIR/updater"
cp "$PACKAGE_DIR/docker-compose.local.yml" "$INSTALL_DIR/docker-compose.local.yml"
cp "$PACKAGE_DIR/docker/Caddyfile" "$INSTALL_DIR/Caddyfile"
cp "$PACKAGE_DIR/updater/Dockerfile" "$INSTALL_DIR/updater/Dockerfile"
cp "$PACKAGE_DIR/updater/health" "$INSTALL_DIR/updater/health"
cp "$PACKAGE_DIR/updater/update.cgi" "$INSTALL_DIR/updater/update.cgi"
chmod 755 "$INSTALL_DIR/updater/update.cgi"
if [ ! -f "$DEVICE_DIR/device-id" ]; then uuidgen | tr '[:upper:]' '[:lower:]' > "$DEVICE_DIR/device-id"; fi
DEVICE_ID="$(tr -d '\r\n' < "$DEVICE_DIR/device-id")"
if ! LAN_IP="$(resolve_lan_ip)"; then pause_exit 1; fi
echo "公司主機將使用區網 IP：$LAN_IP"
ADMIN_PASSWORD="$(existing_env_value ADMIN_PASSWORD)"
POSTGRES_PASSWORD="$(existing_env_value POSTGRES_PASSWORD)"
NEXTAUTH_SECRET="$(existing_env_value NEXTAUTH_SECRET)"
INTEGRITY_SECRET="$(existing_env_value INTEGRITY_SECRET)"
LOCAL_INSTALLER_TOKEN="$(existing_env_value LOCAL_INSTALLER_TOKEN)"
HOST_UPDATE_TOKEN="$(existing_env_value HOST_UPDATE_TOKEN)"
BACKUP_ENCRYPTION_KEY="$(existing_env_value BACKUP_ENCRYPTION_KEY)"
if [ -n "$POSTGRES_PASSWORD" ]; then
  echo "偵測到既有公司主機資料，將保留資料庫密碼、管理員密碼與備份金鑰。"
fi
if [ -z "$ADMIN_PASSWORD" ]; then ADMIN_PASSWORD="$(openssl rand -base64 18 | tr -d '/+=' | cut -c1-16)"; fi
if [ -z "$POSTGRES_PASSWORD" ]; then POSTGRES_PASSWORD="$(openssl rand -hex 24)"; fi
if [ -z "$NEXTAUTH_SECRET" ]; then NEXTAUTH_SECRET="$(openssl rand -hex 32)"; fi
if [ -z "$INTEGRITY_SECRET" ]; then INTEGRITY_SECRET="$(openssl rand -hex 32)"; fi
if [ -z "$LOCAL_INSTALLER_TOKEN" ]; then LOCAL_INSTALLER_TOKEN="$(openssl rand -hex 32)"; fi
if [ -z "$HOST_UPDATE_TOKEN" ]; then HOST_UPDATE_TOKEN="$(openssl rand -hex 32)"; fi
if [ -z "$BACKUP_ENCRYPTION_KEY" ]; then BACKUP_ENCRYPTION_KEY="$(openssl rand -hex 32)"; fi
PUBLIC_KEY="$(curl -fsS "$CENTRAL_URL/api/license/public-key")"

cat > "$INSTALL_DIR/.env.local" <<EOF_ENV
ERP_HTTPS_PORT=3443
COMPOSE_PROJECT_NAME=erinerp
SERVER_HOST=$LAN_IP
ERP_IMAGE=$ERP_IMAGE
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
NEXTAUTH_URL=https://$LAN_IP:3443
NEXTAUTH_SECRET=$NEXTAUTH_SECRET
ADMIN_USERNAME=admin
ADMIN_PASSWORD=$ADMIN_PASSWORD
ADMIN_EMAIL=local-admin@erin-erp.local
COMPANY_NAME=正在同步中央公司資料
BUSINESS_MODE=ERP
CENTRAL_LICENSE_URL=$CENTRAL_URL
LOCAL_ACTIVATION_KEY=$ACTIVATION_KEY
LOCAL_DEVICE_ID=$DEVICE_ID
LOCAL_DEVICE_NAME=$(scutil --get ComputerName 2>/dev/null || hostname)
LOCAL_INSTALLER_TOKEN=$LOCAL_INSTALLER_TOKEN
HOST_UPDATE_TOKEN=$HOST_UPDATE_TOKEN
HOST_BACKUP_DIR=$BACKUP_DIR
BACKUP_ENCRYPTION_KEY=$BACKUP_ENCRYPTION_KEY
BACKUP_RETENTION_DAYS=30
BACKUP_INTERVAL_HOURS=24
LICENSE_ED25519_PUBLIC_KEY_B64=$PUBLIC_KEY
INTEGRITY_SECRET=$INTEGRITY_SECRET
EINVOICE_PROVIDER=
EINVOICE_ALLOW_MOCK=false
EINVOICE_ENV=TEST
EINVOICE_MIG_VERSION=4.1
EINVOICE_SELLER_TAX_ID=
EINVOICE_TURNKEY_OUTBOX_DIR=
EINVOICE_TURNKEY_ACK_DIR=
EINVOICE_VAN_NAME=
EINVOICE_VAN_BASE_URL=
EINVOICE_VAN_CLIENT_ID=
EINVOICE_VAN_CLIENT_SECRET=
EOF_ENV
chmod 600 "$INSTALL_DIR/.env.local" "$DEVICE_DIR/device-id"

cd "$INSTALL_DIR"
echo "下載並啟動艾琳 ERP 公司主機服務…"
pull_erp_image
docker_cli compose --env-file .env.local -f docker-compose.local.yml pull postgres caddy
docker_cli compose --env-file .env.local -f docker-compose.local.yml up -d
docker_cli compose --env-file .env.local -f docker-compose.local.yml restart caddy

echo "等待 HTTPS 公司主機啟動（第一次建立資料庫可能需要數分鐘）…"
READY="false"
for attempt in $(seq 1 150); do
  if curl -kfsS "https://$LAN_IP:3443/login" >/dev/null 2>&1; then READY="true"; break; fi
  if [ $((attempt % 15)) -eq 0 ]; then
    echo "仍在初始化…已等待 $((attempt * 2)) 秒"
  fi
  sleep 2
done
if [ "$READY" != "true" ]; then
  echo "公司主機未能在 300 秒內啟動。"
  show_startup_diagnostics
  echo "請勿刪除 ErinERP 資料或 Docker volumes；請將上方診斷畫面提供給艾琳設計。"
  pause_exit 1
fi

echo "驗證中央授權並同步公司版本…"
if ! STATUS_RESPONSE="$(curl -ksS -X POST -H "x-erin-installer-token: $LOCAL_INSTALLER_TOKEN" "https://$LAN_IP:3443/api/license/local-status")"; then
  echo "啟用失敗：無法連線公司主機授權端點。主機服務已保留。"
  pause_exit 1
fi
if ! printf '%s' "$STATUS_RESPONSE" | grep -q '"ok":true'; then
  STATUS_ERROR="$(printf '%s' "$STATUS_RESPONSE" | sed -n 's/.*"error":"\([^"]*\)".*/\1/p')"
  echo "啟用失敗：${STATUS_ERROR:-啟用碼、付款狀態或中央授權無法驗證}。主機服務已保留。"
  pause_exit 1
fi
LOGIN_USERNAME="$(printf '%s' "$STATUS_RESPONSE" | sed -n 's/.*"loginAccount":{"username":"\([^"]*\)".*/\1/p')"
LOGIN_EMAIL="$(printf '%s' "$STATUS_RESPONSE" | sed -n 's/.*"loginAccount":{"username":"[^"]*","email":"\([^"]*\)".*/\1/p')"

PAIR_DIR="$HOME/Desktop/艾琳ERP-工作站配對"
mkdir -p "$PAIR_DIR"
docker_cli compose --env-file .env.local -f docker-compose.local.yml cp caddy:/data/caddy/pki/authorities/local/root.crt "$PAIR_DIR/ca.crt"
CA_B64="$(base64 < "$PAIR_DIR/ca.crt" | tr -d '\r\n')"
echo "自動登錄公司主機網址與安全憑證…"
REGISTER_RESPONSE="$(curl -fsS -X POST "$CENTRAL_URL/api/license/register-server" \
  --data-urlencode "activationKey=$ACTIVATION_KEY" \
  --data-urlencode "deviceId=$DEVICE_ID" \
  --data-urlencode "serverUrl=https://$LAN_IP:3443" \
  --data-urlencode "caCertificateB64=$CA_B64")"
COMPANY_CODE="$(printf '%s' "$REGISTER_RESPONSE" | sed -n 's/.*"companyCode":"\([^"]*\)".*/\1/p')"
if [ -z "$COMPANY_CODE" ]; then
  echo "公司主機已啟動，但中央自動連線登錄失敗，請將安裝畫面提供給艾琳設計。"
  pause_exit 1
fi

install_workstation_app

{
  echo "艾琳 ERP 加密備份解密金鑰"
  echo "$BACKUP_ENCRYPTION_KEY"
  echo "請立即保存到離線密碼庫或實體保險箱，並與 $BACKUP_DIR 分開存放。遺失此金鑰將無法還原加密備份。"
} > "$PAIR_DIR/艾琳ERP-備份解密金鑰.txt"
chmod 600 "$PAIR_DIR/艾琳ERP-備份解密金鑰.txt"
{
  echo "艾琳 ERP 公司主機登入資料"
  if [ -n "$LOGIN_EMAIL" ]; then
    echo "原本帳號／Email：$LOGIN_EMAIL"
    echo "公司主機帳號名稱：$LOGIN_USERNAME"
    echo "密碼：使用原本網站註冊密碼"
    echo ""
  fi
  echo "備用管理員帳號：admin"
  echo "備用管理員密碼：$ADMIN_PASSWORD"
  echo "此備用密碼只屬於這套安裝，重新執行安裝程式不會改變。"
} > "$PAIR_DIR/管理員登入資料.txt"
chmod 600 "$PAIR_DIR/管理員登入資料.txt"
{
  echo "公司代碼：$COMPANY_CODE"
  echo "公司主機網址：https://$LAN_IP:3443"
  echo "原本註冊帳號與原本密碼可直接登入公司主機。"
  echo "同一台 Mac 可以同時執行公司主機與艾琳 ERP 工作站。"
  echo "工作站只需輸入啟用碼，系統會自動尋找最新主機 IP；一般客戶不需手動匯入 ca.crt。"
  echo "每日加密備份目錄：$BACKUP_DIR（預設保留 30 日）。"
} > "$PAIR_DIR/連線說明.txt"

echo ""
echo "安裝完成"
echo "主機網址：https://$LAN_IP:3443"
echo "公司代碼：$COMPANY_CODE"
if [ -n "$LOGIN_EMAIL" ]; then echo "原本帳號：$LOGIN_EMAIL（使用原本密碼）"; fi
echo "備用帳號：admin"
echo "備用密碼：$ADMIN_PASSWORD"
echo "工作站配對檔：$PAIR_DIR"
echo "每日加密備份：$BACKUP_DIR"
echo "桌面已建立『艾琳 ERP』圖示；第一次開啟時只需輸入啟用碼即可自動尋找主機並完成安全綁定。"
open "$PAIR_DIR"
read -r -p "請保存管理員密碼後按 Enter 關閉…"
