# iOS App 醫美功能隔離

完整 ERP、醫美資料模型、Vercel 網頁版及 Windows／macOS 桌面版均保留。限制只套用在 App Store 的 iOS 客戶端。

## iOS 客戶端識別

iOS 容器必須使用下列其中一種識別方式：

- 所有網頁導覽使用包含 `ErinERP-iOS-App` 的自訂 User-Agent。
- 原生 API 請求送出 `X-Erin-Client-Platform: ios-app`。

不可單靠一般 iPhone／iPad User-Agent 判斷，否則 Safari 開啟的完整 Vercel 網頁版也會被錯誤限制。

## 隔離範圍

iOS App 會隱藏公開方案、註冊、工作區及側邊欄的醫美入口，並在伺服器拒絕：

- `/medical` 與醫美公開網站
- `/api/medical/*`
- `/api/medical-site/*`
- `/print/medical-receipt/*`
- 從 iOS App 建立醫美租戶或醫美 POS 收銀台

既有醫美租戶仍可用同一帳號登入 iOS App 的一般 ERP 工作區；醫美櫃台、病患紀錄與診所網站需改用完整網頁版或桌面版。

## 不受影響的平台

- `https://www.erin-com.com` 的桌面與行動瀏覽器
- iPhone／iPad Safari 加入主畫面的 PWA
- Windows Electron 桌面版
- macOS Electron 桌面版
- 資料庫、醫美資料與既有權限
