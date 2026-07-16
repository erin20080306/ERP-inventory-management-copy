# 資料庫 migration、備份與還原演練

正式站不可直接拿唯一資料庫測試 migration。專案提供 `npm run db:rehearse`，會自動完成：

1. 建立名稱限定為 `erp_rehearsal_*` 的暫存 PostgreSQL 資料庫。
2. 從目前 Git HEAD 建立變更前 schema，寫入租戶、使用者與稽核樣本。
3. 使用 `pg_dump` 建立 migration 前備份。
4. 標記舊版 baseline 已存在，再執行 `prisma migrate deploy`，驗證新欄位、新 POS 資料表、migration 記錄及舊資料。
5. 還原 migration 前備份，確認可回到舊版結構。
6. 建立並還原 migration 後備份，確認災難復原後仍可使用。
7. 成功或失敗都自動刪除測試資料庫；腳本拒絕刪除名稱不符合安全前綴的資料庫。

本機 PostgreSQL 預設執行方式：

```bash
npm run db:rehearse
```

不同主機可設定 `PGHOST`、`PGPORT`、`PGUSER`、`PGDATABASE`。除非在隔離環境除錯，不要使用 `KEEP_REHEARSAL_DB=true`。

正式演練應改用「正式資料庫匿名化副本」，並在維護窗口前記錄備份檔雜湊、耗時、還原耗時、資料筆數及負責人簽核。此腳本驗證結構與基本資料保留，不取代完整營運資料抽查。

若正式資料庫是在導入 Prisma migration 前就已存在，只能在確認 schema 與 baseline 相符後執行一次：

```bash
npx prisma migrate resolve --applied 20260714000000_baseline
npx prisma migrate deploy
```

不可把增量 migration 直接標記為 applied，否則授權與 POS 新欄位實際上不會建立。全新空白資料庫不需要 `resolve`，直接執行 `prisma migrate deploy` 即會依序建立 baseline 與後續 migration。
