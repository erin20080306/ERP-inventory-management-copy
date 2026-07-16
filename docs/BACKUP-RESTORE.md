# 加密備份與災難復原作業

## 備份內容與保存

公司主機的 `backup` 服務會在啟動後立即執行一次完整 PostgreSQL custom-format dump，之後預設每 24 小時執行。每一份 `.erpbackup` 都使用獨立 salt 與 IV，透過 scrypt 衍生金鑰後以 AES-256-GCM 加密，並產生含 SHA-256 的同名 `.json` manifest。

復原所需項目：

1. `.erpbackup` 加密資料庫檔。
2. 安裝時產生的 `BACKUP_ENCRYPTION_KEY` 復原金鑰。
3. 相容的艾琳 ERP 公司主機映像與 PostgreSQL 16 工具。

若客戶已正式啟用電子發票，還必須另外保管該公司的 `.env.local` 電子發票設定、Turnkey 憑證／交換目錄或 VAN 憑證。這些機密不在 PostgreSQL 備份中，不可與公開安裝包或 Git 儲存庫混放。

備份檔與復原金鑰不可放在同一電腦或同一個雲端帳號。至少保留一份 NAS 或受控雲端副本，並定期檢查同步失敗告警。

## 正式還原前置條件

還原會以備份狀態取代現有資料庫，必須排定維護時段並確認所有收銀台都已結班或停止交易。不得在營業中由網頁上傳還原。

1. 記下目標備份檔名及 SHA-256，確認檔案位於安裝時設定的 `ErinERP-Backups` 目錄。
2. 確認復原金鑰仍存在於公司主機 `.env.local`，並有另一份離線副本。
3. 通知所有使用者登出，關閉工作站 App。
4. 進入公司主機安裝目錄：macOS 預設 `~/ErinERP`，Windows 預設 `%USERPROFILE%\ErinERP`。

## 維護還原指令

以下指令只應由艾琳設計或授權維護人員執行。先停止會寫入資料的服務，但保持 PostgreSQL 運行：

```bash
docker compose --env-file .env.local -f docker-compose.local.yml stop app backup caddy
```

執行還原；把檔名替換為已驗證的 `.erpbackup`。程序會先驗證加密與 dump 格式，再建立一份還原前安全備份，任何步驟失敗都會以非零狀態結束：

```bash
docker compose --env-file .env.local -f docker-compose.local.yml run --rm --no-deps \
  -e CONFIRM_RESTORE=ERIN-ERP-RESTORE \
  --entrypoint ./node_modules/.bin/tsx \
  app scripts/restore-encrypted-backup.ts erin-erp-YYYYMMDDTHHMMSSmmmZ.erpbackup
```

還原成功後重新啟動。App 啟動時會套用尚未執行的資料庫 migration：

```bash
docker compose --env-file .env.local -f docker-compose.local.yml up -d
```

## 還原後驗收

1. 檢查 `docker compose ps`，所有服務應為 running／healthy。
2. 以管理者登入，核對公司名稱、業態、授權席次與最近交易日。
3. 核對商品、庫存、未結帳暫存單、銷售、退貨、應收應付、會計傳票、會員點數與發票狀態。
4. 在測試收銀台完成一筆測試交易與取消／退貨，確認庫存及傳票一致。
5. 立即再建立一份新加密備份並確認 SHA-256 可顯示。
6. 將演練日期、備份檔名、驗收人與結果記錄於維護紀錄。

若任一核對失敗，停止 App，不要繼續營業；可使用程序自動建立的「還原前安全備份」回復，並保留所有日誌供調查。
