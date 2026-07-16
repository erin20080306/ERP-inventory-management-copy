# 封閉測試與正式上線閘門

## 目前決策：NO-GO（不可直接覆蓋正式站）

檢查日期：2026-07-15（Asia/Taipei）

目前正式網址 `https://erp-inventory-management-copy.vercel.app` 指向 2026-06-13 建立的舊部署。該部署雖為 Ready，但 `/solutions`、`/plans`、`/privacy`、`/terms` 與 `/api/license/public-key` 均回傳 404，表示目前正式站尚未包含新的 ERP／POS 選擇、方案、法律頁與中央簽章授權功能。

Vercel production 目前只看得到以下環境變數名稱：

- `DATABASE_URL`
- `NEXTAUTH_URL`
- `NEXTAUTH_SECRET`
- `GMAIL_APP_PASSWORD`

Preview 與 Development 尚未設定環境變數。檢查過程只列名稱，未讀取或輸出任何密鑰內容。

## 阻擋正式上線的項目

1. 必須先以正式資料的匿名化副本完成六個 migration、備份與災難還原演練。
2. 必須補齊中央 Ed25519 金鑰、授權雜湊、稽核與 Cron 密鑰；中央私鑰不得進入下載包。
3. 必須建立與 production 分離的 Preview 資料庫，不能讓預覽部署連到正式資料。
4. 必須以封閉測試帳號完成 ERP、POS、雙模式管理後台、到期封鎖、3 日試用、寄信及席次驗收。
5. 正式管理者密碼曾用於測試溝通；封閉測試前必須更換，且不得寫入 Git、文件或測試輸出。
6. GHCR 容器映像必須可由未登入客戶下載，否則公司主機安裝器會在 `docker compose pull` 失敗。
7. 原生工作站客戶端程式已完成且 macOS arm64 測試封裝成功；正式交付仍須 Apple Developer ID 公證、Windows Code Signing 憑證，以及兩個作業系統的實機安裝／升級／移除驗收。
8. 公司主機仍需 Docker Desktop；不得把工作站原生 DMG／EXE 誤稱為完全免前置環境的公司主機。

## 中央 Vercel 環境變數

部署前以 Vercel Production 設定下列變數，再於安全環境執行 `npm run release:check`。檢查器只輸出缺少或無效的「變數名稱與原因」，不輸出值。

| 變數 | 中央 Vercel | 本機客戶端 | 用途 |
|---|---:|---:|---|
| `DATABASE_URL` | 必要 | 由安裝器產生 | PostgreSQL 連線 |
| `NEXTAUTH_URL` | 必要，HTTPS | 由安裝器產生 | 登入回呼來源 |
| `NEXTAUTH_SECRET` | 必要，至少 32 字元 | 各主機獨立 | Session 簽章 |
| `GMAIL_USER` | 必要 | 不需要 | SMTP 寄件帳號 |
| `GMAIL_APP_PASSWORD` | 必要 | 不需要 | Gmail 應用程式密碼 |
| `CONTACT_TO_EMAIL` | 必要 | 不需要 | 洽詢通知收件人 |
| `LICENSE_ED25519_PRIVATE_KEY_B64` | 必要、只在中央 | 禁止 | 簽發離線租約 |
| `LICENSE_ED25519_PUBLIC_KEY_B64` | 必要 | 必要 | 驗證離線租約 |
| `LICENSE_KEY_SECRET` | 必要，至少 32 字元 | 禁止 | 啟用碼雜湊 |
| `LICENSE_DEVICE_SECRET` | 必要，至少 32 字元 | 禁止 | 裝置識別雜湊 |
| `LICENSE_AUDIT_SECRET` | 必要，至少 32 字元 | 禁止 | 授權事件鏈 |
| `INTEGRITY_SECRET` | 必要，至少 32 字元 | 各主機獨立 | 業務稽核鏈 |
| `CRON_SECRET` | 必要，至少 32 字元 | 不需要 | `/api/cron/keepalive` 驗證 |

下列為本機客戶端專用，禁止設在中央 Vercel：`LOCAL_LICENSE_MODE`、`CENTRAL_LICENSE_URL`、`LOCAL_ACTIVATION_KEY`、`LOCAL_DEVICE_ID`、`LOCAL_DEVICE_NAME`、`LOCAL_INSTALLER_TOKEN`。

## 部署前自動檢查

在候選版本依序執行：

```bash
npm run test:fulfillment
npm run test:pos
npm run test:accounting
npm run test:resilience
npm run test:release
npx tsc --noEmit
npm run build
```

在已安全注入 Production 變數、但不會把輸出上傳的環境執行：

```bash
npm run release:check
```

結果必須是 `ok: true`。不得把 `.env`、Vercel 匯出的密鑰或 Production 資料庫連線字串加入 Release 附件。

## 資料庫發布順序

1. 暫停正式寫入，記錄開始時間與當前 deployment ID。
2. 建立可驗證、加密且異地保存的完整備份，記錄校驗碼與還原指令。
3. 將備份還原成隔離的匿名測試資料庫，執行 `npm run db:rehearse`。
4. 對正式資料庫執行 `npx prisma migrate deploy`，不可使用 `prisma db push`。
5. 檢查 `_prisma_migrations` 六筆 migration 均為成功，並執行唯讀健康檢查。
6. 部署候選版本；先驗證登入、管理後台、授權公鑰與一筆不影響帳務的測試流程，再恢復寫入。
7. 保存發布紀錄：Git commit、Vercel deployment ID、migration、備份位置、執行人與驗收人。

## 封閉測試驗收矩陣

| 範圍 | 必測案例 | 通過條件 |
|---|---|---|
| 入口 | 選擇一般企業 ERP 或 POS | 建立公司後進入對應模式，管理者可切換與管理兩種後台 |
| 法律 | 登入頁隱私權與聲明 | 未勾選不得登入；連結可開啟且內容正確 |
| 試用 | 新公司、重裝、時間經過 | 只給 3 日；重裝不重置；到期封鎖業務頁 |
| 方案 | 1 對 2／3／5／8，月租／年租／買斷 | 價格、優惠 2 個月、AI、維護費與一次修改說明一致 |
| 洽詢 | 移除線上付款、送出聯絡表單 | 無舊付款連結；通知寄至指定信箱；失敗有可追蹤紀錄 |
| ERP | 採購分批進貨、銷售分批出貨、退回 | 庫存、應收應付、傳票與剩餘量一致；併發不超收／超出 |
| 會計 | 製單、他人覆核、過帳、月結、重開、沖銷 | 製單者不可自審；已過帳不可改刪；關帳後禁止補登 |
| POS | 開班、結帳、多元付款、原交易退款、結班 | 原子扣庫；不可超退；現金差異與退款傳票正確 |
| 授權 | 1 台主機、超工作站席次、撤銷、複製租約、偽造請求、改日期、斷網 | 主機不占工作站額度；超席次、缺私鑰、重播與竄改封鎖；有效租約最多離線 24 小時；連線後自動續約 |
| 權限 | ERP 管理者、POS 管理者、一般使用者 | 選單、API 與資料租戶隔離均符合角色，不只隱藏按鈕 |
| 復原 | 還原備份與回到前一部署 | 在約定 RTO／RPO 內恢復，帳務總額與稽核鏈可驗證 |

## 正式發布與回滾

建議先開放 1 至 3 家測試公司，至少完成一個完整日結與一個會計月結演練，再擴大銷售。觀察登入失敗、API 5xx、郵件失敗、授權拒絕、席次衝突、稽核鏈異常與資料庫容量。

若程式錯誤但資料庫相容，立即將 Vercel alias 回指上一個已驗收 deployment。若 migration 或資料有破壞性問題，維持停止寫入，依已演練步驟還原發布前備份；不得只回退程式後繼續寫入不相容的新 schema。回滾完成後重新核對庫存、應收應付、傳票借貸與 POS 班次總額。

只有上述阻擋項全部關閉、驗收矩陣簽核、備份可還原且正式密碼已輪替後，才可把決策改為 GO。
