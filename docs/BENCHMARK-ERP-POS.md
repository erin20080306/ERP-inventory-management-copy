# 專業 ERP／POS 標竿分析與補強順序

更新日期：2026-09-11

> 本文件整理市場上主流專業 ERP 與 POS 系統的公開資料，用來確認本系統的功能方向與補強順序。
> 公開產品介紹只能佐證功能方向，不能取代實際版本的操作手冊與逐項驗收腳本；
> 本文件也不代表任何相容性、認證或法規遵循聲明。

---

## 一、專業 ERP 標竿

| 系統 | 定位與規模 | 公開語言支援 | 本系統可借鏡之處 |
| --- | --- | --- | --- |
| SAP Business One | 中大型製造業，約 50–200 人 | 25+ 語言、40+ 國在地化 | **管理員逐使用者指定語言**；報表與單據以該使用者語言輸出 |
| Oracle NetSuite | 一體化雲端，財務＋電商 | 多語，OneWorld 多子公司 | 多公司合併報表、公司間沖銷、多幣別換算與期末重估 |
| Microsoft Dynamics 365 Business Central | 中小企業，約 US$80／人／月 | 多語 | 與 Office／Teams 深度整合；對應到本系統的 Excel 匯出與郵件寄單 |
| Odoo | 開源模組化，約 US$24.9／人／月 | 30+ 語言，**每位使用者可各自切換** | 在地化套件：各國會計科目表與稅制一鍵套用 |
| ERPNext | 全開源，無授權費 | 多語 | 自架路線；本系統的 Docker 一鍵包走同一條路 |
| 鼎新／鼎捷 | 台灣市佔第一，40 年、逾 5 萬家導入 | 以中文為主 | 「POS 前台＋總部管理＋ERP 整合」三層架構 |

**市場趨勢（2026）**

- 約七成新導入為雲端部署；中小企業區段成長最快。
- 最大變化是生成式 AI 與自主代理進入 ERP，使其從「記錄系統」轉為「主動營運助理」。
  本系統已有 AI 助理與智慧補貨，方向一致；但 AI 僅能提出摘要、異常與草稿，
  不應未經人員確認自動過帳、付款或申報（見 `ERP-POS-GAP-ANALYSIS.md`）。

## 二、專業 POS 標竿

| 系統 | 強項 | 本系統可借鏡之處 |
| --- | --- | --- |
| Toast | 餐飲功能最深 | 桌邊點餐、手持機、廚房協同（本系統 KDS 已有雛形） |
| Lightspeed | 複雜零售庫存最深 | **批號／序號／效期／儲位**——專業與入門的分水嶺 |
| Square | 最易上手、月繳可隨時終止 | 零門檻開店體驗 |
| Shopify POS | 線上線下同一套庫存 | 全通路；本系統已有商城，可與門市庫存打通 |
| Clover | **唯一可自帶收單機構** | 金流不綁定，客戶可自行議價 |
| Loyverse | 軟體免費 | 免費版獲客策略 |
| iCHEF | 台灣 iPad POS 市佔第一 | 「專為小店設計」的減法思維 |
| 肚肚 | 鴻海與王品投資，服務連鎖品牌 | 連鎖總部集中管控與跨店參數下發 |
| 微碧 | 全台逾 4,000 家門市 | 深耕單一業態（早餐、便當、火鍋） |

## 三、對照本系統的補強順序

`ERP-POS-GAP-ANALYSIS.md` 與 `ERP_POS_COMPLETENESS_AUDIT.md` 已列出 P0／P1／P2。
以下是「從標竿系統回看」才浮現、且尚未被那兩份文件強調的項目。

### 已完成

1. **多語言（繁中／英文）介面** — 2026-09-11 完成第一階段。
   SAP Business One 與 Odoo 都把它當基礎建設而非附加功能；
   做了才談得上外商客戶、外籍店員與海外市場。實作說明見 `I18N.md`。

### 建議順序

2. **批號／序號／效期／儲位**（對標 Lightspeed）
   沒有這一層就進不了食品、醫材與 3C 客戶。已列在 gap 文件 P1，
   但從標竿看，它的優先度應高於多數 P1 項目。

3. **POS 真離線交易佇列**（對標 Toast、Lightspeed）
   目前已有 24 小時授權租約與停電復原草稿，但缺少「斷網期間持續結帳、
   恢復後依序回補」的佇列與衝突處理。門市最在意的就是這件事。

4. **多幣別交易與期末重估**（對標 NetSuite）
   本次已完成「顯示格式跟著語言、幣別跟著租戶」的基礎；
   下一步是多幣別單據、匯率表、兌換損益與期末重估傳票。

5. **Open API 與 Webhook**（對標 Square、Shopify）
   本系統已有完整的 API route，補上 API Key 管理與 webhook 事件推送，
   即可對接物流、金流與第三方工具，形成生態系。

6. **多公司／多分支合併報表**（對標 NetSuite OneWorld）
   目前是多租戶隔離，尚無同一集團下的跨公司合併與公司間沖銷。

## 四、刻意不做的事

- 不逐像素複製任何商業系統的專有畫面、文字或程式；只對齊功能與資料流程。
- 不以公開行銷資料宣稱法規遵循。台灣電子發票在完成財政部 Turnkey／VAN
  憑證、字軌與測試平台驗證前，一律標示為測試開票。
- 英文介面是閱讀輔助，不等於法定英文財報格式；科目英文名稱採 IFRS／
  一般美國公認會計原則常見用語，供外籍主管與會計師閱讀。

## 參考來源

- 11 Best ERP Software for 2026 — <https://softwareconnect.com/roundups/best-erp-software/>
- Best ERP Systems 2026 (G2) — <https://learn.g2.com/best-erp-software>
- The 8 Best POS Systems in 2026 — <https://dupple.com/learn/best-pos-systems>
- Best Restaurant POS Systems 2026 — <https://restaurantvelocity.com/blog/best-restaurant-pos-systems/>
- ERP 系統怎麼選？2026 最新 ERP 廠商介紹（鼎新數智）— <https://www.digiwin.com/tw/blog/erp/3247.html>
- 2026 最新 10 大 POS 系統推薦評比 — <https://pos.contenta.tw/367/>
- 2026 餐飲 POS 系統推薦（微碧）— <https://blog.weiby.tw/pos-system-recommend-brand/>
- Odoo 多語言設定 — <https://sdlccorp.com/post/how-to-manage-multi-language-setup-in-odoo/>
- SAP Business One 全球語言支援 — <https://targetintegration.com/en_in/sap-business-one-hidden-feature-global-language-support/>
