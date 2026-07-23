# macOS／Windows 本機主機與原生工作站

## 架構與席次定義

本機版分成兩種安裝：

1. **公司主機**：一家公司限一台，執行 PostgreSQL、ERP／POS 與 HTTPS 閘道。現階段以 Docker Desktop 執行，macOS 使用 `.command`，Windows 使用 `.bat + .ps1` 一鍵設定。
2. **操作工作站**：每一台要操作系統的 Mac／Windows 安裝原生 Electron 客戶端，不需要 Docker。正式 Release 產生 macOS DMG／ZIP 與 Windows NSIS EXE。

「1 對 2」代表一台公司主機加上最多兩台操作工作站；主機電腦若也要操作，必須安裝桌面客戶端並占一個工作站席次。主機不占工作站額度，但同一公司只能有一台有效主機。

## 安裝順序

> [!IMPORTANT]
> 本機安裝版的商品、客戶、訂單、庫存、會計與稽核資料，儲存在客戶選定的公司主機電腦之 PostgreSQL Docker volume。工作站只透過 HTTPS 操作，不保存整套營運資料庫；中央服務只管理公司代碼、方案、席次、授權租約與簽章連線設定。客戶必須依「備份」章節把加密備份複製到 NAS 或受控雲端，並將復原金鑰分開保管。

網站註冊提供 3 日線上試用，使用者在註冊時自行選擇企業 ERP、電商商城＋ERP、零售 POS 或餐飲 POS。公司主機與桌面工作站安裝包只在付款確認後開通；中央只簽章同步客戶已選擇並由艾琳設計確認的業態、方案及席次，不會替客戶任意改版。

### 1. 安裝公司主機

公司主機先安裝並啟動 Docker Desktop，再執行下載包：

- macOS 下載包：雙擊 `installer/Install-ErinERP.command`
- Windows 下載包：雙擊 `installer/Install-ErinERP.bat`

原始碼內的中文檔名會在封裝時轉成上述 ASCII 檔名，避免不同 ZIP 解壓縮程式造成中文檔名亂碼。

安裝器只要求艾琳設計付款開通後提供的啟用碼，不讓客戶自行選擇版本。中央簽章租約會同步正確公司名稱與企業 ERP／零售 POS／餐飲 POS 業態，避免本機設定被竄改。安裝器會建立資料庫、隨機管理員密碼、主機裝置 ID、稽核密鑰與 Caddy HTTPS 服務，並在驗證完成後自動把區網主機網址與 CA 根憑證登錄至中央。完成後桌面會出現 `艾琳ERP-工作站配對`：

- `連線說明.txt`：公司代碼與公司主機的 `https://區網IP:3443` 網址。
- `ca.crt`：維修驗收備用的公開根憑證，沒有私鑰；一般客戶不需手動匯入。

啟用碼不得寫入配對檔或以公開連結傳送。

人工聯絡、付款核對、續約接續與到期封鎖規則見 [`COMMERCIAL-ACTIVATION.md`](./COMMERCIAL-ACTIVATION.md)。

### 2. 安裝操作工作站

在每台已購買席次的 Mac／Windows 執行原生安裝包，第一次開啟時：

1. 輸入艾琳設計確認付款後提供的公司代碼。
2. 輸入一次性啟用碼；中央會回傳具 Ed25519 簽章的主機網址與 `ca.crt` 公開內容。
3. 客戶端向中央綁定工作站席次，驗證公司主機後開啟 ERP／POS。
4. 只有無法使用中央查詢的封閉內網，才由安裝人員改用手動模式輸入 HTTPS 主機網址並選擇 `ca.crt`。

客戶端會在該電腦產生 Ed25519 金鑰。啟用碼與私鑰使用 macOS Keychain 或 Windows DPAPI 加密保存；私鑰不會傳到中央、公司主機或下載包。

## 授權與防複製

- 中央端私鑰簽發 24 小時離線租約；公司主機與工作站只有中央公鑰。
- 公司主機租約標記為 `SERVER`，一家公司最多一台。
- 工作站租約標記為 `WORKSTATION`，數量依 2／3／5／8 台方案限制。
- 工作站每個 HTTP 請求都會用裝置私鑰簽章方法、路徑、時間與一次性 nonce；公司主機會驗證中央租約、公司、版本、公鑰、到期時間與防重播。
- 只複製租約檔、修改本機資料庫日期或抄走裝置 ID，沒有原電腦私鑰仍不能操作。
- 中央明確回覆到期、撤銷、無效啟用碼或超席次時立即封鎖；只有網路／中央 5xx 暫時故障才可沿用尚未過期的 24 小時租約。
- 刪除應用資料會產生新裝置身分並再次占席；不會重置 3 日試用或繞過方案上限。舊裝置須由平台管理者撤銷。

公司主機只接受 Caddy HTTPS 連線，Next.js 與 PostgreSQL 不直接暴露在區網。一般瀏覽器沒有工作站私鑰，即使知道網址與帳密也不能呼叫業務 API 或列印資料。

## 中央 Vercel 設定

中央必須設定 `LICENSE_ED25519_PRIVATE_KEY_B64` 與 `LICENSE_ED25519_PUBLIC_KEY_B64`。可在安全電腦產生：

```bash
openssl genpkey -algorithm Ed25519 -out license-private.pem
openssl pkey -in license-private.pem -pubout -out license-public.pem
openssl pkcs8 -topk8 -nocrypt -in license-private.pem -outform DER | base64
openssl pkey -pubin -in license-public.pem -outform DER | base64
```

中央還必須設定 `LICENSE_KEY_SECRET`、`LICENSE_DEVICE_SECRET`、`LICENSE_AUDIT_SECRET`、`INTEGRITY_SECRET` 與 `NEXTAUTH_SECRET`。全部不可提交 Git 或放入客戶下載包。完整清單與驗收步驟見 `docs/RELEASE-GATES.md`。

## Gmail 通知

Vercel 沒有內建信箱服務，但 Next.js API Route 可經 Gmail SMTP 寄信：

- `GMAIL_USER=erin20080306@gmail.com`
- `GMAIL_APP_PASSWORD=<Google 兩步驟驗證產生的應用程式密碼>`
- `CONTACT_TO_EMAIL=erin20080306@gmail.com`

大量商業寄信仍建議改用具重送、退信與網域驗證的 Email 供應商。

## Release 產物與簽章

推送 `v*` 標籤後，GitHub Actions 會先通過 migration、ERP、POS、會計、授權、型別與正式建置測試，再產生：

- `ErinERP-Host-macOS-<版本>.zip`：macOS 公司主機啟動器。
- `ErinERP-Host-Windows-<版本>.zip`：Windows 公司主機啟動器。
- `ErinERP-Desktop-macOS-*.dmg/.zip`：原生 macOS 工作站。
- `ErinERP-Desktop-Windows-x64-Setup.exe`：原生 Windows 工作站。
- `release-manifest.json`／`SHA256SUMS.txt`：版本與 SHA-256 完整性核對資料。

正式標籤要求 GitHub Secrets 中存在 Apple Developer ID／公證資料與 Windows Code Signing 憑證，缺少任一項就拒絕發布，不能把未簽章測試包交付客戶。GHCR 映像也必須設為 public，否則公司主機無法下載指定版本。

目前本機已成功產生未簽章的 macOS arm64 DMG／ZIP，以及交叉封裝的 Windows x64 NSIS EXE，供內部確認封裝結構、檔案完整性與一鍵安裝設定。Windows 測試包使用 `npm run desktop:dist:win:test` 明確停用簽章；正式交付仍須實際 Apple／Windows 憑證，並在兩個作業系統完成安裝、移除、升級與防毒軟體驗收。

## POS 硬體橋接

原生工作站包含受限硬體橋接，只有艾琳 ERP 主視窗能呼叫。現階段可讀取作業系統印表機清單，並將客顯自動放到第二螢幕；一般瀏覽器只提供分頁客顯與協定模擬。80mm 原始 ESC/POS、錢櫃接腳／電壓及刷卡 ECR 介接必須在採購型號確定後安裝對應介接器並完成實機驗收，詳見 [`POS-HARDWARE-ACCEPTANCE.md`](./POS-HARDWARE-ACCEPTANCE.md)。

## 電子發票介接

公司主機預留 Turnkey MIG 4.1 與 VAN 加值中心兩種正式介接方式，但安裝器不會預填測試憑證或把模擬發票當作正式發票。取得財政部測試資格、配號、賣方統一編號與介接端點後，須由維護人員設定公司主機環境並完成開立、作廢、折讓、斷線重送與查詢驗收；詳細門檻見 [`EINVOICE-READINESS.md`](./EINVOICE-READINESS.md)。

## 備份

資料庫位於 Docker volume `erp_postgres_data`，安裝後會由獨立備份服務立即建立第一份備份，之後每 24 小時使用 PostgreSQL 完整 dump 建立 AES-256-GCM 加密檔，預設保留 30 日。管理者也可在「系統設定 → 系統備份與還原」立即建立、檢視 SHA-256 與下載備份。

主機安裝器會在使用者目錄建立 `ErinERP-Backups`，並另外在桌面配對資料夾產生復原金鑰。必須把 `.erpbackup` 定期複製或同步到 NAS／受控雲端，且把復原金鑰放在不同位置的離線密碼庫或保險箱；同一顆硬碟上的資料夾不算異地備份。遺失金鑰後無法解密。

為避免營業中誤覆蓋、漏表或跨公司資料損害，網頁不提供直接上傳還原。正式還原必須停止 App、備份服務與 HTTPS 閘道，保留 PostgreSQL 運行，並由維護人員使用明確確認字串執行；程序會先驗證 AES-GCM、防竄改標記及 PostgreSQL dump 格式，再建立一份還原前安全備份。完整演練與指令見 [`BACKUP-RESTORE.md`](./BACKUP-RESTORE.md)。

只複製安裝器、Caddy CA、Docker 設定檔或工作站 App 都不能還原營運資料。每次正式版本交付及至少每季，應在隔離測試資料庫完成一次還原演練並記錄結果。

電子發票的正式憑證、VAN 密鑰、Turnkey 目錄檔案及 `.env.local` 不包含在資料庫備份內，必須另以加密方式備份並限制只有授權維護人員可取用；不得把它們存入 Git、配對資料夾或客戶可下載的安裝包。
