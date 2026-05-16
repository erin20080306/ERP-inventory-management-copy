# 專業 ERP 進銷存會計管理系統

一套可實際部署的雲端 ERP 系統，涵蓋 **商品、採購、銷售、庫存、會計、報表、使用者與權限管理**。

![Next.js](https://img.shields.io/badge/Next.js-14-black) ![TypeScript](https://img.shields.io/badge/TypeScript-5-blue) ![Prisma](https://img.shields.io/badge/Prisma-5-2D3748) ![PostgreSQL](https://img.shields.io/badge/PostgreSQL-14+-336791) ![License](https://img.shields.io/badge/License-MIT-green)

---

## ✨ 功能列表

### 登入與權限
- NextAuth + Credentials + JWT session
- bcrypt 加密密碼（**不會明碼儲存**）
- RBAC 角色權限系統（可細粒度控制 view / create / edit / delete / export / approve / void）
- 登入失敗次數限制（15 分鐘內失敗 5 次鎖定）
- 登入紀錄 + 操作稽核 Log
- 預設 7 種角色：系統管理員 / 老闆 / 會計 / 採購 / 銷售 / 倉管 / 查詢員

### 進銷存
- **商品管理**：SKU / 條碼 / 規格 / 成本 / 售價 / 安全庫存 / 分類 / 單位 / 稅率
- **客戶 / 供應商管理**：公司資料、統編、聯絡人、信用額度、付款條件
- **採購管理**：採購單建立、狀態流轉（草稿 → 送出 → 核准 → 進貨 → 取消），進貨自動入庫 + 產生應付帳款
- **銷售管理**：銷售訂單建立、狀態流轉（草稿 → 確認 → 出貨 → 已收款 → 取消），出貨自動扣庫 + 產生應收帳款
- **報價單 / 退貨管理**
- **庫存管理**：即時庫存、多倉庫、庫存異動紀錄、低庫存警示、盤點、調撥
- **編號自動產生**：PO / SO / JE / RP / SP 等（月份 + 流水號，可自訂格式）

### 會計
- **會計科目 (Chart of Accounts)**：六大類（資產、負債、權益、收入、成本、費用）
- **傳票管理**：借貸平衡檢查、草稿 / 過帳 / 作廢，已過帳不可修改
- **應收帳款 / 應付帳款**：自動由銷售單 / 採購單產生、支援部分沖帳、逾期追蹤
- **現金 / 銀行**：現金帳戶、銀行帳戶、轉帳、對帳
- **發票管理**：銷項 / 進項發票、稅額與單據關聯
- **稅率設定**：可依地區設定多組稅率（預設 營業稅 5% / 零稅率）

### 報表
- 損益表、資產負債表、試算表、營運摘要
- 儀表板 KPI + 近 14 日銷售 / 採購趨勢圖（Recharts）
- 商品 / 客戶銷售排行榜
- 庫存總值、低庫存警示

### 系統
- 公司基本資料、幣別、Logo
- 操作稽核紀錄 + 登入紀錄
- 使用者啟停用、密碼修改

### UI / UX
- Next.js 14 App Router + Server Components
- Tailwind CSS + shadcn/ui 風格
- 深 / 淺色主題切換
- 響應式（RWD）
- Loading / EmptyState / 403 Forbidden 頁
- Toast 通知 (sonner)

---

## 🛠 技術架構

| 類別 | 技術 |
|------|------|
| 前端 | Next.js 14, React 18, TypeScript, Tailwind CSS, Radix UI, Recharts, Sonner |
| 後端 | Next.js API Routes（Route Handlers） |
| ORM | Prisma 5 |
| 資料庫 | PostgreSQL（Supabase / Neon / Vercel Postgres / Railway / 本地皆可） |
| 驗證 | NextAuth.js (Credentials + JWT) |
| 部署 | Vercel |

---

## 📁 專案結構

```
Inventory-Management-System/
├── prisma/
│   ├── schema.prisma              # 全部資料表 schema
│   └── seed.ts                    # 種子資料
├── src/
│   ├── app/
│   │   ├── (app)/                 # 已登入區塊（layout 自動擋未登入）
│   │   │   ├── dashboard/
│   │   │   ├── products/
│   │   │   ├── customers/
│   │   │   ├── suppliers/
│   │   │   ├── purchases/
│   │   │   ├── sales/
│   │   │   ├── quotations/
│   │   │   ├── inventory/
│   │   │   ├── warehouses/
│   │   │   ├── returns/
│   │   │   ├── accounting/
│   │   │   │   ├── accounts/      # 會計科目
│   │   │   │   ├── journals/      # 傳票
│   │   │   │   ├── receivables/   # 應收
│   │   │   │   ├── payables/      # 應付
│   │   │   │   ├── cash/          # 現金銀行
│   │   │   │   └── invoices/      # 發票
│   │   │   ├── reports/
│   │   │   ├── users/
│   │   │   ├── roles/
│   │   │   ├── settings/
│   │   │   └── audit/
│   │   ├── api/                   # REST API Routes
│   │   ├── login/                 # 登入頁
│   │   ├── layout.tsx
│   │   └── globals.css
│   ├── components/
│   │   ├── ui/                    # 基礎元件（button / card / table / dialog / input ...）
│   │   ├── layout/                # Sidebar / Header / PageShell
│   │   ├── crud-table.tsx         # 通用 CRUD 列表
│   │   ├── order-client.tsx       # 採購 / 銷售通用元件
│   │   ├── party-client.tsx       # 客戶 / 供應商通用元件
│   │   ├── ledger-client.tsx      # AR / AP 通用元件
│   │   └── providers.tsx
│   ├── lib/
│   │   ├── prisma.ts
│   │   ├── auth.ts                # NextAuth 設定 + hasPermission
│   │   ├── api.ts                 # requireAuth / requirePermission / audit / nextNumber
│   │   ├── permissions.ts         # 權限定義 + 預設角色
│   │   ├── documents.ts           # 採購進貨 / 銷售出貨 交易邏輯
│   │   └── utils.ts
│   └── middleware.ts              # 路由權限保護
├── .env.example
├── next.config.js
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

---

## 🚀 快速開始

### 1. 安裝依賴

```bash
npm install
```

### 2. 設定環境變數

複製 `.env.example` 為 `.env`，並填入：

```bash
cp .env.example .env
```

```ini
DATABASE_URL="postgresql://user:password@localhost:5432/erp?schema=public"
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="請改為長隨機字串，可用 openssl rand -base64 32 產生"
ADMIN_USERNAME="admin"
ADMIN_PASSWORD="661012"
ADMIN_EMAIL="admin@example.com"
```

### 3. 準備 PostgreSQL

三選一：

**A. Docker (最快)**
```bash
docker run -d --name erp-pg -p 5432:5432 \
  -e POSTGRES_PASSWORD=erp123 -e POSTGRES_DB=erp postgres:16-alpine
# .env:
# DATABASE_URL="postgresql://postgres:erp123@localhost:5432/erp?schema=public"
```

**B. Neon (免費雲端 Postgres)**
前往 <https://neon.tech> 註冊 → 建立專案 → 複製連線字串貼到 `DATABASE_URL`。

**C. Vercel Postgres**
Vercel 專案 → Storage → 建立 Postgres → 自動注入環境變數。

### 4. 建立資料表 + 種子資料

```bash
npm run db:push       # 以目前 schema 建立 / 同步資料表
npm run db:seed       # 建立權限 / 角色 / admin / 範例資料
```

或使用 migration：

```bash
npm run db:migrate    # prisma migrate dev
```

### 5. 啟動開發伺服器

```bash
npm run dev
```

開啟 <http://localhost:3000> → 自動導向 `/login`。

**預設登入：**
- 帳號：`admin`
- 密碼：`661012`

---

## 🌐 部署到 GitHub + Vercel

### Step 1：將程式碼推上 GitHub

```bash
cd Inventory-Management-System
git init
git add .
git commit -m "feat: initial ERP system"
git branch -M main
git remote add origin https://github.com/erin20080306/Inventory-Management-System.git
git push -u origin main
```

### Step 2：Vercel 部署

1. 前往 <https://vercel.com/new>，匯入 `erin20080306/Inventory-Management-System`。
2. **Framework Preset** 選 Next.js，保持預設。
3. 設定環境變數（Settings → Environment Variables）：
   - `DATABASE_URL` → Neon / Vercel Postgres 連線字串
   - `NEXTAUTH_URL` → 你的 Vercel 網址（例 `https://your-erp.vercel.app`）
   - `NEXTAUTH_SECRET` → `openssl rand -base64 32`
   - `ADMIN_USERNAME` / `ADMIN_PASSWORD` / `ADMIN_EMAIL`（僅首次 seed 用）
4. **Build Command**（可選，若需要自動 migrate）：
   ```
   prisma migrate deploy && next build
   ```
5. 點 Deploy。
6. 部署完成後，於本地執行一次 seed（因為 Vercel build 不會跑 seed）：
   ```bash
   DATABASE_URL="<你的雲端 DATABASE_URL>" npm run db:seed
   ```
7. 造訪網址登入 `admin` / `661012`。

> ⚠️ **正式環境請立刻修改 admin 密碼**。

---

## 🧪 測試方式

1. 登入後先到 **系統設定** 填公司資料
2. 到 **商品管理** 新增商品（SKU、售價、成本、安全庫存）
3. 到 **供應商 / 客戶管理** 建立資料
4. 到 **採購管理** → 新增採購單 → 核准 → 進貨入庫（自動生成應付帳款）
5. 到 **銷售管理** → 新增銷售單 → 出貨（自動扣庫 + 生成應收帳款）
6. 到 **庫存管理** 查看即時庫存與異動紀錄
7. 到 **會計 → 傳票** 建立傳票（必須借貸平衡，才能儲存）
8. 到 **會計 → 應收/應付** 進行收付款
9. 到 **報表** 檢視試算表與損益表
10. 到 **使用者管理 / 角色權限** 新增帳號並指派角色

---

## 🔐 安全性

- ✅ bcrypt 12 輪雜湊密碼
- ✅ API 統一權限檢查 (`requirePermission`)
- ✅ Prisma ORM 參數化查詢（防 SQL Injection）
- ✅ React 自動 HTML 跳脫（防 XSS）
- ✅ NextAuth CSRF token
- ✅ JWT session (預設 8 小時過期)
- ✅ 登入失敗限制
- ✅ 操作 Audit Log（記錄使用者 / 時間 / IP / 內容）
- ✅ 角色基礎 RBAC

---

## 🧰 常用指令

| 指令 | 說明 |
|------|------|
| `npm run dev` | 啟動開發伺服器 |
| `npm run build` | 正式版建置 |
| `npm run start` | 啟動正式伺服器 |
| `npm run db:push` | 推送 schema（開發用） |
| `npm run db:migrate` | 建立 migration |
| `npm run db:deploy` | 部署環境套用 migration |
| `npm run db:seed` | 執行種子資料 |
| `npm run db:reset` | 重置資料庫（⚠️ 會清除所有資料） |

---

## ❓ 常見問題

**Q: 無法連線到資料庫？**
A: 確認 `.env` 的 `DATABASE_URL` 正確、Postgres 是否啟動、防火牆是否允許。

**Q: seed 後登入仍失敗？**
A: 確認有跑 `npm run db:seed`；或檢查 `.env` 的 `ADMIN_USERNAME` / `ADMIN_PASSWORD`。

**Q: 可以匯出 Excel / PDF 嗎？**
A: 報表表格可由瀏覽器「列印 → 另存 PDF」匯出；Excel 匯出可延伸實作 `xlsx` 套件。

**Q: 如何新增模組？**
A: 1. 在 `prisma/schema.prisma` 新增 model  2. `npm run db:push`  3. 在 `src/lib/permissions.ts` 加入模組權限碼  4. 建立 `api/<module>` 與 `app/(app)/<module>` 兩個資料夾即可。

---

## 📄 License

MIT © 2026
