$ErrorActionPreference = "Stop"
$PackageDir = Split-Path -Parent $PSScriptRoot
$InstallDir = Join-Path $env:USERPROFILE "ErinERP"
$DeviceDir = Join-Path $env:ProgramData "ErinERP"
$BackupDir = Join-Path $env:USERPROFILE "ErinERP-Backups"
$CentralUrl = "https://erp-inventory-management-copy.vercel.app"
$ImageTag = "latest"
$ImageTagFile = Join-Path $PackageDir "image-tag.txt"
if (Test-Path $ImageTagFile) { $ImageTag = (Get-Content $ImageTagFile -Raw).Trim() }

Write-Host "艾琳 ERP 公司主機 Windows 安裝程式" -ForegroundColor Cyan
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-Host "請先安裝並啟動 Docker Desktop：https://www.docker.com/products/docker-desktop/" -ForegroundColor Yellow
  Read-Host "按 Enter 結束"
  exit 1
}
docker info *> $null
if ($LASTEXITCODE -ne 0) { throw "Docker Desktop 尚未啟動" }

$ActivationKey = Read-Host "輸入艾琳設計提供的啟用碼"
if ($ActivationKey.Length -lt 24) { throw "啟用碼格式錯誤，請向艾琳設計確認" }

New-Item -ItemType Directory -Force -Path $InstallDir, $DeviceDir, $BackupDir, (Join-Path $InstallDir "updater") | Out-Null
Copy-Item (Join-Path $PackageDir "docker-compose.local.yml") (Join-Path $InstallDir "docker-compose.local.yml") -Force
New-Item -ItemType Directory -Force -Path (Join-Path $InstallDir "docker") | Out-Null
Copy-Item (Join-Path $PackageDir "docker\Caddyfile") (Join-Path $InstallDir "Caddyfile") -Force
Copy-Item (Join-Path $PackageDir "updater\Dockerfile") (Join-Path $InstallDir "updater\Dockerfile") -Force
Copy-Item (Join-Path $PackageDir "updater\health") (Join-Path $InstallDir "updater\health") -Force
Copy-Item (Join-Path $PackageDir "updater\update.cgi") (Join-Path $InstallDir "updater\update.cgi") -Force
$DeviceFile = Join-Path $DeviceDir "device-id"
if (-not (Test-Path $DeviceFile)) { [guid]::NewGuid().ToString() | Set-Content -NoNewline $DeviceFile }
$DeviceId = (Get-Content $DeviceFile -Raw).Trim()
$LanIp = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notmatch '^(127|169\.254)\.' -and $_.InterfaceOperationalStatus -eq 'Up' } | Select-Object -First 1 -ExpandProperty IPAddress)
if (-not $LanIp) { $LanIp = "127.0.0.1" }
function New-SecureBytes([int]$Length) {
  $Bytes = New-Object byte[] $Length
  $Generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try { $Generator.GetBytes($Bytes) } finally { $Generator.Dispose() }
  return ,$Bytes
}
function New-HexSecret([int]$Length) {
  return -join ((New-SecureBytes $Length) | ForEach-Object { $_.ToString("x2") })
}
$EnvFile = Join-Path $InstallDir ".env.local"
function Get-ExistingEnvValue([string]$Name) {
  if (-not (Test-Path $EnvFile)) { return $null }
  $Prefix = "$Name="
  $Line = Get-Content $EnvFile | Where-Object { $_.StartsWith($Prefix) } | Select-Object -First 1
  if ($null -eq $Line) { return $null }
  return $Line.Substring($Prefix.Length)
}
$AdminPassword = Get-ExistingEnvValue "ADMIN_PASSWORD"
$PostgresPassword = Get-ExistingEnvValue "POSTGRES_PASSWORD"
$NextAuthSecret = Get-ExistingEnvValue "NEXTAUTH_SECRET"
$IntegritySecret = Get-ExistingEnvValue "INTEGRITY_SECRET"
$LocalInstallerToken = Get-ExistingEnvValue "LOCAL_INSTALLER_TOKEN"
$HostUpdateToken = Get-ExistingEnvValue "HOST_UPDATE_TOKEN"
$BackupEncryptionKey = Get-ExistingEnvValue "BACKUP_ENCRYPTION_KEY"
if ($PostgresPassword) {
  Write-Host "偵測到既有公司主機資料，將保留資料庫密碼、管理員密碼與備份金鑰。" -ForegroundColor Cyan
}
if (-not $AdminPassword) { $AdminPassword = ([Convert]::ToBase64String((New-SecureBytes 18)).Replace("/", "A").Replace("+", "B").Replace("=", "")).Substring(0,16) }
if (-not $PostgresPassword) { $PostgresPassword = New-HexSecret 24 }
if (-not $NextAuthSecret) { $NextAuthSecret = New-HexSecret 32 }
if (-not $IntegritySecret) { $IntegritySecret = New-HexSecret 32 }
if (-not $LocalInstallerToken) { $LocalInstallerToken = New-HexSecret 32 }
if (-not $HostUpdateToken) { $HostUpdateToken = New-HexSecret 32 }
if (-not $BackupEncryptionKey) { $BackupEncryptionKey = New-HexSecret 32 }
$PublicKey = (Invoke-RestMethod "$CentralUrl/api/license/public-key").Trim()
$DeviceName = $env:COMPUTERNAME
$BackupDirDocker = $BackupDir.Replace("\", "/")

@"
ERP_HTTPS_PORT=3443
COMPOSE_PROJECT_NAME=erinerp
SERVER_HOST=$LanIp
ERP_IMAGE=ghcr.io/erin20080306/erp-inventory-management-copy:$ImageTag
POSTGRES_PASSWORD=$PostgresPassword
NEXTAUTH_URL=https://${LanIp}:3443
NEXTAUTH_SECRET=$NextAuthSecret
ADMIN_USERNAME=admin
ADMIN_PASSWORD=$AdminPassword
ADMIN_EMAIL=local-admin@erin-erp.local
COMPANY_NAME=正在同步中央公司資料
BUSINESS_MODE=ERP
CENTRAL_LICENSE_URL=$CentralUrl
LOCAL_ACTIVATION_KEY=$ActivationKey
LOCAL_DEVICE_ID=$DeviceId
LOCAL_DEVICE_NAME=$DeviceName
LOCAL_INSTALLER_TOKEN=$LocalInstallerToken
HOST_UPDATE_TOKEN=$HostUpdateToken
HOST_BACKUP_DIR=$BackupDirDocker
BACKUP_ENCRYPTION_KEY=$BackupEncryptionKey
BACKUP_RETENTION_DAYS=30
BACKUP_INTERVAL_HOURS=24
LICENSE_ED25519_PUBLIC_KEY_B64=$PublicKey
INTEGRITY_SECRET=$IntegritySecret
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
"@ | Set-Content -Encoding UTF8 (Join-Path $InstallDir ".env.local")

Push-Location $InstallDir
docker compose --env-file .env.local -f docker-compose.local.yml pull postgres app backup caddy
docker compose --env-file .env.local -f docker-compose.local.yml up -d
docker compose --env-file .env.local -f docker-compose.local.yml restart caddy
Pop-Location

Write-Host "等待 HTTPS 公司主機啟動（第一次建立資料庫可能需要數分鐘）…"
$Ready = $false
for ($i = 1; $i -le 150; $i++) {
  curl.exe -k -f -s "https://${LanIp}:3443/login" -o NUL
  if ($LASTEXITCODE -eq 0) { $Ready = $true; break }
  if (($i % 15) -eq 0) { Write-Host "仍在初始化…已等待 $($i * 2) 秒" }
  Start-Sleep -Seconds 2
}
if (-not $Ready) {
  $DiagnosticLog = Join-Path $InstallDir "startup-diagnostics.log"
  Write-Host ""
  Write-Host "【公司主機啟動診斷】" -ForegroundColor Yellow
  Push-Location $InstallDir
  try {
    $Diagnostics = @(
      "=== docker compose ps ==="
      (docker compose --env-file .env.local -f docker-compose.local.yml ps 2>&1 | Out-String)
      "=== postgres / app / caddy logs ==="
      (docker compose --env-file .env.local -f docker-compose.local.yml logs --no-color --tail=160 postgres app caddy 2>&1 | Out-String)
    ) -join [Environment]::NewLine
    $Diagnostics | Tee-Object -FilePath $DiagnosticLog | Write-Host
  } finally {
    Pop-Location
  }
  Write-Host "診斷記錄已儲存：$DiagnosticLog" -ForegroundColor Yellow
  throw "公司主機未能在 300 秒內啟動。請勿刪除 ErinERP 資料或 Docker volumes；請將上方診斷畫面提供給艾琳設計"
}

Write-Host "驗證中央授權並同步公司版本…"
$StatusJson = curl.exe -k -s -X POST -H "x-erin-installer-token: $LocalInstallerToken" "https://${LanIp}:3443/api/license/local-status"
if ($LASTEXITCODE -ne 0) { throw "啟用失敗：無法連線公司主機授權端點。主機服務已保留，請將 docker compose logs 提供給艾琳設計" }
$Status = $StatusJson | ConvertFrom-Json
if (-not $Status.ok) {
  $StatusError = if ($Status.error) { $Status.error } else { "啟用碼、付款狀態或中央授權無法驗證" }
  throw "啟用失敗：$StatusError。主機服務已保留，請將此訊息提供給艾琳設計"
}
$LoginUsername = $Status.loginAccount.username
$LoginEmail = $Status.loginAccount.email

$PairDir = Join-Path ([Environment]::GetFolderPath("Desktop")) "艾琳ERP-工作站配對"
New-Item -ItemType Directory -Force -Path $PairDir | Out-Null
Push-Location $InstallDir
docker compose --env-file .env.local -f docker-compose.local.yml cp caddy:/data/caddy/pki/authorities/local/root.crt (Join-Path $PairDir "ca.crt")
Pop-Location
$CaB64 = [Convert]::ToBase64String([System.IO.File]::ReadAllBytes((Join-Path $PairDir "ca.crt")))
Write-Host "自動登錄公司主機網址與安全憑證…"
$Registration = Invoke-RestMethod -Method Post -Uri "$CentralUrl/api/license/register-server" -Body @{
  activationKey = $ActivationKey
  deviceId = $DeviceId
  serverUrl = "https://${LanIp}:3443"
  caCertificateB64 = $CaB64
}
if (-not $Registration.ok -or -not $Registration.companyCode) { throw "中央自動連線登錄失敗，請聯絡艾琳設計" }
$CompanyCode = $Registration.companyCode

Write-Host "下載並安裝艾琳 ERP 工作站與桌面圖示…" -ForegroundColor Cyan
$WorkstationInstaller = Join-Path $env:TEMP "ErinERP-Desktop-Setup.exe"
try {
  $Bootstrap = Invoke-RestMethod -Headers @{ "x-erin-activation-key" = $ActivationKey } -Uri "$CentralUrl/api/installers/bootstrap?platform=windows&arch=x64&delivery=location"
  if ($Bootstrap.downloadUrl) {
    Invoke-WebRequest -UseBasicParsing -Uri $Bootstrap.downloadUrl -OutFile $WorkstationInstaller
  } else {
    Invoke-WebRequest -UseBasicParsing -Headers @{ "x-erin-activation-key" = $ActivationKey } -Uri "$CentralUrl/api/installers/bootstrap?platform=windows&arch=x64" -OutFile $WorkstationInstaller
  }
  $InstallerProcess = Start-Process -FilePath $WorkstationInstaller -ArgumentList "/S" -Wait -PassThru
  if ($InstallerProcess.ExitCode -ne 0) { throw "工作站安裝程式回覆 $($InstallerProcess.ExitCode)" }
  Write-Host "已建立桌面『艾琳 ERP』圖示。" -ForegroundColor Green
} catch {
  Write-Host "工作站 App 暫時無法自動安裝；公司主機不受影響，可稍後從 ERP 的『桌面版』下載。$($_.Exception.Message)" -ForegroundColor Yellow
} finally {
  Remove-Item $WorkstationInstaller -Force -ErrorAction SilentlyContinue
}
@"
艾琳 ERP 加密備份解密金鑰
$BackupEncryptionKey
請立即保存到離線密碼庫或實體保險箱，並與 $BackupDir 分開存放。遺失此金鑰將無法還原加密備份。
"@ | Set-Content -Encoding UTF8 (Join-Path $PairDir "艾琳ERP-備份解密金鑰.txt")
@"
艾琳 ERP 公司主機登入資料
原本帳號／Email：$LoginEmail
公司主機帳號名稱：$LoginUsername
密碼：使用原本網站註冊密碼

備用管理員帳號：admin
備用管理員密碼：$AdminPassword
此備用密碼只屬於這套安裝，重新執行安裝程式不會改變。
"@ | Set-Content -Encoding UTF8 (Join-Path $PairDir "管理員登入資料.txt")
@"
公司代碼：$CompanyCode
公司主機網址：https://${LanIp}:3443
原本註冊帳號與原本密碼可直接登入公司主機。
請在每台已購買席次的 Windows／macOS 電腦安裝「艾琳 ERP」桌面客戶端，只需輸入啟用碼，最新主機 IP 與 CA 憑證會由中央安全帶入。
ca.crt 只供艾琳設計維修驗收；一般客戶不需手動匯入。啟用碼不要寫入或轉傳此配對檔。
每日加密備份目錄：$BackupDir（預設保留 30 日）。解密金鑰必須另外離線保存。
"@ | Set-Content -Encoding UTF8 (Join-Path $PairDir "連線說明.txt")

Write-Host "`n安裝完成" -ForegroundColor Green
Write-Host "主機網址：https://${LanIp}:3443"
Write-Host "公司代碼：$CompanyCode"
if ($LoginEmail) { Write-Host "原本帳號：$LoginEmail（使用原本密碼）" }
Write-Host "備用帳號：admin"
Write-Host "備用密碼：$AdminPassword" -ForegroundColor Yellow
Write-Host "工作站配對檔：$PairDir"
Write-Host "每日加密備份：$BackupDir"
Write-Host "桌面已建立『艾琳 ERP』圖示；第一次開啟時只需輸入啟用碼即可自動尋找主機並完成安全綁定。"
Start-Process $PairDir
Read-Host "請保存管理員密碼後按 Enter 關閉"
