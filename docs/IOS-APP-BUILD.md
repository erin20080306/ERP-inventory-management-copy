# Erin ERP iOS App

## 專案定位

iOS App 使用 SwiftUI 與 WKWebView 保留既有 Vercel ERP 設計，並由原生層提供返回、工作區、重新整理、分享、網路狀態與選用的 Face ID／裝置密碼鎖定。

WKWebView 會在 User-Agent 加上 `ErinERP-iOS-App/1.0`，初始請求也會送出 `X-Erin-Client-Platform: ios-app`。Vercel 網頁、Safari、PWA 與桌面版不會收到這些識別，因此保留完整 ERP 與醫美功能。

## 產生 Xcode 專案

```sh
cd ios
xcodegen generate
open ErinERP.xcodeproj
```

Bundle ID 為 `com.erincom.erp`，顯示名稱為 `Erin ERP`。第一次用實機或 Archive 建置時，請在 Xcode 的 Signing & Capabilities 選擇個人 Apple Developer Team。

## 無簽章建置

```sh
xcodebuild \
  -project ErinERP.xcodeproj \
  -scheme ErinERP \
  -configuration Debug \
  -destination 'generic/platform=iOS Simulator' \
  CODE_SIGNING_ALLOWED=NO \
  build
```

## App Store 前待辦

- Apple Developer Program 個人會員
- App Store Connect 建立 `com.erincom.erp` App
- StoreKit 自動續訂訂閱商品與伺服器通知
- App 內帳號刪除流程
- App Privacy 資料蒐集聲明與公開隱私權政策
- 測試租戶、審核帳密與 Review Notes
- TestFlight 實機驗收
