#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PACKAGE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
INSTALL_DIR="$HOME/ErinERP"
DEVICE_DIR="$HOME/Library/Application Support/ErinERP"
BACKUP_DIR="$HOME/ErinERP-Backups"
CENTRAL_URL="https://erp-inventory-management-copy.vercel.app"
IMAGE_TAG="latest"
if [ -f "$PACKAGE_DIR/image-tag.txt" ]; then IMAGE_TAG="$(tr -d '\r\n' < "$PACKAGE_DIR/image-tag.txt")"; fi

echo "艾琳 ERP 公司主機 macOS 安裝程式"
if ! command -v docker >/dev/null 2>&1; then
  echo "請先安裝並啟動 Docker Desktop：https://www.docker.com/products/docker-desktop/"
  read -r -p "按 Enter 結束…"
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  echo "Docker Desktop 尚未啟動，請啟動後再執行本檔。"
  read -r -p "按 Enter 結束…"
  exit 1
fi

read -r -p "輸入艾琳設計提供的啟用碼：" ACTIVATION_KEY
if [ ${#ACTIVATION_KEY} -lt 24 ]; then
  echo "啟用碼格式錯誤，請向艾琳設計確認。"
  read -r -p "按 Enter 結束…"
  exit 1
fi

mkdir -p "$INSTALL_DIR" "$DEVICE_DIR" "$BACKUP_DIR"
cp "$PACKAGE_DIR/docker-compose.local.yml" "$INSTALL_DIR/docker-compose.local.yml"
cp "$PACKAGE_DIR/docker/Caddyfile" "$INSTALL_DIR/Caddyfile"
if [ ! -f "$DEVICE_DIR/device-id" ]; then uuidgen | tr '[:upper:]' '[:lower:]' > "$DEVICE_DIR/device-id"; fi
DEVICE_ID="$(tr -d '\r\n' < "$DEVICE_DIR/device-id")"
LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo 127.0.0.1)"
ADMIN_PASSWORD="$(openssl rand -base64 18 | tr -d '/+=' | cut -c1-16)"
POSTGRES_PASSWORD="$(openssl rand -hex 24)"
NEXTAUTH_SECRET="$(openssl rand -hex 32)"
INTEGRITY_SECRET="$(openssl rand -hex 32)"
LOCAL_INSTALLER_TOKEN="$(openssl rand -hex 32)"
BACKUP_ENCRYPTION_KEY="$(openssl rand -hex 32)"
PUBLIC_KEY="$(curl -fsS "$CENTRAL_URL/api/license/public-key")"

cat > "$INSTALL_DIR/.env.local" <<EOF
ERP_HTTPS_PORT=3443
SERVER_HOST=$LAN_IP
ERP_IMAGE=ghcr.io/erin20080306/erp-inventory-management-copy:$IMAGE_TAG
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
EOF
chmod 600 "$INSTALL_DIR/.env.local" "$DEVICE_DIR/device-id"

cd "$INSTALL_DIR"
docker compose --env-file .env.local -f docker-compose.local.yml pull
docker compose --env-file .env.local -f docker-compose.local.yml up -d

echo "等待 HTTPS 公司主機啟動…"
READY="false"
for _ in $(seq 1 60); do
  if curl -kfsS "https://$LAN_IP:3443/login" >/dev/null 2>&1; then READY="true"; break; fi
  sleep 2
done
if [ "$READY" != "true" ]; then
  echo "公司主機未能在 120 秒內啟動，請將 docker compose logs 提供給艾琳設計。"
  read -r -p "按 Enter 結束…"
  exit 1
fi

echo "驗證中央授權並同步公司版本…"
if ! curl -kfsS -X POST -H "x-erin-installer-token: $LOCAL_INSTALLER_TOKEN" "https://$LAN_IP:3443/api/license/local-status" >/dev/null; then
  echo "啟用失敗：啟用碼、付款狀態或中央授權無法驗證。主機服務已保留，請將 docker compose logs 提供給艾琳設計。"
  read -r -p "按 Enter 結束…"
  exit 1
fi

PAIR_DIR="$HOME/Desktop/艾琳ERP-工作站配對"
mkdir -p "$PAIR_DIR"
docker compose --env-file .env.local -f docker-compose.local.yml cp caddy:/data/caddy/pki/authorities/local/root.crt "$PAIR_DIR/ca.crt"
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
  read -r -p "按 Enter 結束…"
  exit 1
fi
{
  echo "艾琳 ERP 加密備份解密金鑰"
  echo "$BACKUP_ENCRYPTION_KEY"
  echo "請立即保存到離線密碼庫或實體保險箱，並與 $BACKUP_DIR 分開存放。遺失此金鑰將無法還原加密備份。"
} > "$PAIR_DIR/艾琳ERP-備份解密金鑰.txt"
chmod 600 "$PAIR_DIR/艾琳ERP-備份解密金鑰.txt"
{
  echo "公司代碼：$COMPANY_CODE"
  echo "公司主機網址：https://$LAN_IP:3443"
  echo "請在每台已購買席次的 Windows／macOS 電腦安裝『艾琳 ERP』桌面客戶端，只需輸入公司代碼與啟用碼，主機網址與 CA 憑證會由中央安全帶入。"
  echo "ca.crt 只供艾琳設計維修驗收；一般客戶不需手動匯入。啟用碼不要寫入或轉傳此配對檔。"
  echo "每日加密備份目錄：$BACKUP_DIR（預設保留 30 日）。解密金鑰必須另外離線保存。"
} > "$PAIR_DIR/連線說明.txt"

echo ""
echo "安裝完成"
echo "主機網址：https://$LAN_IP:3443"
echo "公司代碼：$COMPANY_CODE"
echo "帳號：admin"
echo "密碼：$ADMIN_PASSWORD"
echo "工作站配對檔：$PAIR_DIR"
echo "每日加密備份：$BACKUP_DIR"
echo "請從已授權的桌面客戶端連線；一般瀏覽器不具工作站私鑰，無法操作。"
open "$PAIR_DIR"
read -r -p "請保存管理員密碼後按 Enter 關閉…"
