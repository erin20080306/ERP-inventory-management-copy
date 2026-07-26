# 發布工程與安全更新

## CI 原則

`ERP CI` 只讀取程式碼並執行 Prisma、靜態驗證、型別與回歸測試。CI 不再修改程式、不再提交診斷檔，也不會直接推送 `main`。

舊的速度優化機制已拆除。四個動作（POS v5、POS v6、餐飲佇列 v7、`package.json` 測試指令調整）都已存在於正式 codebase；移除的是一次性套用器與觸發檔，不是正式功能。回歸驗證仍保留在 `npm run test:speed`。

## Host 發布鏈

1. `main` 變更觸發 Host workflow。
2. AMD64 與 ARM64 分別原生建置候選映像。
3. 組合多平台 manifest，計算並保存不可變 `sha256` Digest。
4. 以 Digest 執行 manifest 驗證與 Apple Silicon 啟動 smoke test。
5. 只有仍為最新 `main` 的候選映像能晉升 `latest`。
6. 中央版本 API 簽章同時包含版本 SHA、映像 Digest 與不可變映像網址。
7. 新版 Host updater 只拉取簽章指定的 Digest；`latest` 僅保留給舊安裝包與人工相容流程。

這可避免「查詢時是 A、實際下載時 `latest` 已移到 B」的時間差問題。

## 手動安裝包

公司 Host 仍維持手動下載與安裝。這次沒有改成背景自動安裝，也沒有移除 Docker Desktop、資料庫 volume、備份 volume 或現有更新回復機制。

## Outbox

商城履約補同步使用 `StorefrontSyncOutbox` 專用表記錄事件、嘗試次數、下次重試時間、最後錯誤與完成狀態。資料庫 migration 會把既有 `SystemSetting` 暫存事件搬入 Outbox，避免升級時遺失待同步訂單。

## 回復

Host 更新前仍先做加密完整備份。若新映像健康檢查失敗，updater 會恢復先前的 `ERP_IMAGE` 指向並重新建立 app/backup；資料庫與備份 volume 不刪除。
