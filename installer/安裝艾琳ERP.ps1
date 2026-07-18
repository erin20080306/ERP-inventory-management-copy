$ErrorActionPreference = "Stop"
$PackageDir = Split-Path -Parent $PSScriptRoot
$InstallDir = Join-Path $env:USERPROFILE "ErinERP"
$DeviceDir = Join-Path $env:ProgramData "ErinERP"
$BackupDir = Join-Path $env:USERPROFILE "ErinERP-Backups"
$CentralUrl = "https://erp-inventory-management-copy.vercel.app"
$DockerDocsUrl = "https://docs.docker.com/desktop/setup/install/windows-install/"
$ImageTag = "latest"
$ImageTagFile = Join-Path $PackageDir "image-tag.txt"
if (Test-Path $ImageTagFile) { $ImageTag = (Get-Content $ImageTagFile -Raw).Trim() }
$script:DockerExe = $null

function Resolve-DockerExe {
  $command = Get-Command docker.exe -ErrorAction SilentlyContinue
  if ($command) { $script:DockerExe = $command.Source; return $true }
  $candidates = @(
    (Join-Path $env:ProgramFiles "Docker\Docker\resources\bin\docker.exe"),
    (Join-Path $env:LOCALAPPDATA "Programs\Docker\Docker\resources\bin\docker.exe")
  )
  foreach ($candidate in $candidates) {
    if (Test-Path $candidate) { $script:DockerExe = $candidate; return $true }
  }
  return $false
}

function Test-DockerReady {
  if (-not (Resolve-DockerExe)) { return $false }
  & $script:DockerExe info *> $null
  return $LASTEXITCODE -eq 0
}

function Start-DockerDesktop {
  $candidates = @(
    (Join-Path $env:ProgramFiles "Docker\Docker\Docker Desktop.exe"),
    (Join-Path $env:LOCALAPPDATA "Programs\Docker\Docker\Docker Desktop.exe")
  )
  foreach ($candidate in $candidates) {
    if (Test-Path $candidate) { Start-Process $candidate; return $true }
  }
  return $false
}

function Wait-DockerReady {
  Write-Host "等待 Docker Desktop 啟動…" -ForegroundColor Cyan
  Write-Host "第一次啟動時，請在 Docker 視窗接受條款並完成 WSL 2／系統權限設定。" -ForegroundColor Yellow
  for ($i = 0; $i -lt 100; $i++) {
    if (Test-DockerReady) { Write-Host "Docker Desktop 已就緒。" -ForegroundColor Green; return $true }
    Start-Sleep -Seconds 3
  }
  return $false
}

function Ensure-DockerDesktop {
  if (Test-DockerReady) { return }
  if (Start-DockerDesktop) {
    Write-Host "已找到 Docker Desktop，正在自動開啟…" -ForegroundColor Cyan
    if (Wait-DockerReady) { return }
    throw "Docker Desktop 尚未完成啟動。請確認 Docker 視窗是否仍在等待接受條款、WSL 2 更新或系統重新啟動。"
  }

  Write-Host "`n【尚缺一個必要程式：Docker Desktop】" -ForegroundColor Yellow
  Write-Host "你下載的 ErinERP-Host ZIP 是艾琳 ERP 公司主機安裝包；Docker Desktop 是執行資料庫與主機服務的必要環境。"
  Write-Host "這兩者是不同程式，因此 Host ZIP 不會把 Docker Desktop 重新包在裡面。"
  Write-Host "`n即將開啟 Docker 官方安裝頁，請下載 Windows x86_64 版本。" -ForegroundColor Cyan
  Start-Process $DockerDocsUrl
  Write-Host "安裝步驟：下載 Docker Desktop Installer.exe → 完成安裝 → 開啟 Docker Desktop → 接受條款。"
  Read-Host "Docker Desktop 已安裝並開啟後，按 Enter 繼續"
  if (Start-DockerDesktop -and (Wait-DockerReady)) { return }
  throw "仍無法連線 Docker Desktop。請確認 Docker 顯示正在執行，再重新執行本安裝程式。"
}

function Invoke-Docker {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)
  & $script:DockerExe @Arguments
  if ($LASTEXITCODE -ne 0) { throw "Docker 指令執行失敗：docker $($Arguments -join ' ')" }
}

Write-Host "艾琳 ERP 公司主機 Windows 輔助安裝程式" -ForegroundColor Cyan
Write-Host "同一台 Windows 電腦可以同時安裝『公司主機』與『艾琳 ERP 工作站』。"
Ensure-DockerDesktop

$ActivationKey = Read-Host "輸入艾琳設計提供的啟用碼"
if ($ActivationKey.Length -lt 24) { throw "啟用碼格式錯誤，請向艾琳設計確認" }

New-Item -ItemType Directory -Force -Path $InstallDir, $DeviceDir, $BackupDir | Out-Null
Copy-Item (Join-Path $PackageDir "docker-compose.local.yml") (Join-Path $InstallDir "docker-compose.local.yml") -Force
New-Item -ItemType Directory -Force -Path (Join-Path $InstallDir "docker") | Out-Null
Copy-Item (Join-Path $PackageDir "docker\Caddyfile") (Join-Path $InstallDir "Caddyfile") -Force
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
$AdminPassword = ([Convert]::ToBase64String((New-SecureBytes 18)).Replace("/", "A").Replace("+", "B").Replace("=", "")).Substring(0,16)
$PostgresPassword = New-HexSecret 24
$NextAuthSecret = New-HexSecret 32
$IntegritySecret = New-HexSecret 32
$LocalInstallerToken = New-HexSecret 32
$BackupEncryptionKey = New-HexSecret 32
$PublicKey = (Invoke-RestMethod "$CentralUrl/api/license/public-key").Trim()
$DeviceName = $env:COMPUTERNAME
$BackupDirDocker = $BackupDir.Replace("\", "/")

@"
ERP_HTTPS_PORT=3443
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
Write-Host "下載並啟動艾琳 ERP 公司主機服務…" -ForegroundColor Cyan
Invoke-Docker compose --env-file .env.local -f docker-compose.local.yml pull
Invoke-Docker compose --env-file .env.local -f docker-compose.local.yml up -d
Pop-Location

Write-Host "等待 HTTPS 公司主機啟動…"
$Ready = $false
for ($i = 0; $i -lt 60; $i++) {
  curl.exe -k -f -s "https://${LanIp}:3443/login" -o NUL
  if ($LASTEXITCODE -eq 0) { $Ready = $true; break }
  Start-Sleep -Seconds 2
}
if (-not $Ready) { throw "公司主機未能在 120 秒內啟動，請將安裝畫面提供給艾琳設計" }

Write-Host "驗證中央授權並同步公司版本…"
$StatusJson = curl.exe -k -f -s -X POST -H "x-erin-installer-token: $LocalInstallerToken" "https://${LanIp}:3443/api/license/local-status"
if ($LASTEXITCODE -ne 0) { throw "啟用失敗：啟用碼、付款狀態或中央授權無法驗證。主機服務已保留" }
$Status = $StatusJson | ConvertFrom-Json
if (-not $Status.ok) { throw "本機授權驗證未完成" }

$PairDir = Join-Path ([Environment]::GetFolderPath("Desktop")) "艾琳ERP-工作站配對"
New-Item -ItemType Directory -Force -Path $PairDir | Out-Null
Push-Location $InstallDir
Invoke-Docker compose --env-file .env.local -f docker-compose.local.yml cp caddy:/data/caddy/pki/authorities/local/root.crt (Join-Path $PairDir "ca.crt")
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
@"
艾琳 ERP 加密備份解密金鑰
$BackupEncryptionKey
請立即保存到離線密碼庫或實體保險箱，並與 $BackupDir 分開存放。遺失此金鑰將無法還原加密備份。
"@ | Set-Content -Encoding UTF8 (Join-Path $PairDir "艾琳ERP-備份解密金鑰.txt")
@"
公司代碼：$CompanyCode
公司主機網址：https://${LanIp}:3443
同一台 Windows 電腦可以同時執行公司主機與艾琳 ERP 工作站。
工作站只需輸入公司代碼與啟用碼；一般客戶不需手動匯入 ca.crt。
每日加密備份目錄：$BackupDir（預設保留 30 日）。
"@ | Set-Content -Encoding UTF8 (Join-Path $PairDir "連線說明.txt")

Write-Host "`n安裝完成" -ForegroundColor Green
Write-Host "主機網址：https://${LanIp}:3443"
Write-Host "公司代碼：$CompanyCode"
Write-Host "帳號：admin"
Write-Host "密碼：$AdminPassword" -ForegroundColor Yellow
Write-Host "工作站配對檔：$PairDir"
Write-Host "每日加密備份：$BackupDir"
Write-Host "現在可在同一台 Windows 電腦開啟艾琳 ERP 工作站，輸入公司代碼與啟用碼。"
Start-Process $PairDir
Read-Host "請保存管理員密碼後按 Enter 關閉"