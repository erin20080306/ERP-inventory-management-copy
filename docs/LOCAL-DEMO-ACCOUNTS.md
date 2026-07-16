# 本機模擬客戶與生命週期驗收

這些帳號只會建立在 `127.0.0.1／localhost` 的 `erp_preview` 資料庫。登入頁快速填入按鈕也只在本機預覽顯示，正式網站不會公開測試密碼。

| 登入按鈕 | 帳號 | 密碼 | 業態／授權狀態 | 驗收重點 |
| --- | --- | --- | --- | --- |
| 企業 ERP | `demo-erp` | `DemoERP2026!` | ERP／年租已付款 | 進銷存、會計、3 席、無試用橫幅 |
| 零售 POS | `demo-retail` | `DemoRetail2026!` | 零售 POS／月租已付款 | 條碼商品、POS＋進銷存＋會計、2 席 |
| 餐飲 POS | `demo-food` | `DemoFood2026!` | 餐飲 POS／買斷已付款 | 商品圖片、桌位、廚房、POS＋進銷存＋會計、5 席 |
| 試用倒數 | `demo-trial` | `DemoTrial2026!` | ERP／3 日試用中 | 頂端試用倒數、方案聯絡入口 |
| 試用到期 | `demo-expired` | `DemoExpired2026!` | 零售 POS／試用已逾 3 日 | 登入後只顯示到期封鎖頁，不可操作資料 |
| 授權撤銷 | `demo-revoked` | `DemoRevoked2026!` | ERP／已付款後撤銷 | 登入後顯示管理者撤銷原因，不可繞過 |

建立或重建資料：

```bash
set -a; source .env.local; set +a
npm run db:demo
npm run test:demo-lifecycle
```

重建會重設以上六個測試公司的授權事件、付款測試紀錄與範例商品，但不會修改其他公司或平台管理者帳號。付款資料明確標註為本機驗收資料，不能計入正式營收。
