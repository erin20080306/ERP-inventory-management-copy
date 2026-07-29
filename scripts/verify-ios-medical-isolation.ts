import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  ERIN_CLIENT_PLATFORM_HEADER,
  IOS_APP_CLIENT_PLATFORM,
  IOS_APP_USER_AGENT_MARKER,
  isIosAppRequest,
  isIosRestrictedMedicalPath,
  isMedicalEnabledForRequest,
} from "../src/lib/client-platform";

const iosAppHeaders = new Headers({ "user-agent": `Mozilla/5.0 ${IOS_APP_USER_AGENT_MARKER}/1.0` });
const explicitIosHeaders = new Headers({ [ERIN_CLIENT_PLATFORM_HEADER]: IOS_APP_CLIENT_PLATFORM });
const iphoneSafariHeaders = new Headers({
  "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1",
});
const desktopHeaders = new Headers({ "user-agent": "ErinERP-Desktop/1.0 Electron/43" });

assert.equal(isIosAppRequest(iosAppHeaders), true, "iOS App 自訂 User-Agent 必須啟用平台隔離");
assert.equal(isIosAppRequest(explicitIosHeaders), true, "iOS 原生 API 請求標頭必須啟用平台隔離");
assert.equal(isIosAppRequest(iphoneSafariHeaders), false, "iPhone Safari 網頁版必須保留完整 ERP");
assert.equal(isIosAppRequest(desktopHeaders), false, "桌面版必須保留完整 ERP");
assert.equal(isMedicalEnabledForRequest(iphoneSafariHeaders), true, "Vercel 行動網頁不得隱藏醫美功能");
assert.equal(isMedicalEnabledForRequest(iosAppHeaders), false, "App Store iOS 客戶端不得提供醫美入口");

for (const pathname of [
  "/medical",
  "/medical/atelier-clinic",
  "/api/medical/bootstrap",
  "/api/medical-site/atelier-clinic",
  "/print/medical-receipt/example",
]) {
  assert.equal(isIosRestrictedMedicalPath(pathname), true, `${pathname} 必須由 iOS 平台閘門阻擋`);
}

for (const pathname of ["/medical-aesthetics/clinic-hero.png", "/products", "/api/products", "/workspace"]) {
  assert.equal(isIosRestrictedMedicalPath(pathname), false, `${pathname} 不得被醫美路由規則誤擋`);
}

const root = process.cwd();
const sources = {
  middleware: readFileSync(path.join(root, "src/middleware.ts"), "utf8"),
  webViewModel: readFileSync(path.join(root, "ios/ErinERP/Sources/ERPWebViewModel.swift"), "utf8"),
  webView: readFileSync(path.join(root, "ios/ErinERP/Sources/ERPWebView.swift"), "utf8"),
  layout: readFileSync(path.join(root, "src/app/(app)/layout.tsx"), "utf8"),
  workspace: readFileSync(path.join(root, "src/app/(app)/workspace/page.tsx"), "utf8"),
  sidebar: readFileSync(path.join(root, "src/components/layout/sidebar-nav.tsx"), "utf8"),
  registerApi: readFileSync(path.join(root, "src/app/api/register/route.ts"), "utf8"),
  login: readFileSync(path.join(root, "src/app/login/client.tsx"), "utf8"),
  iosLogin: readFileSync(path.join(root, "src/app/login/ios/page.tsx"), "utf8"),
  trialGate: readFileSync(path.join(root, "src/components/trial-gate.tsx"), "utf8"),
};

assert.match(sources.middleware, /isIosRestrictedMedicalPath/, "middleware 必須阻擋 iOS 醫美頁面與 API");
assert.match(sources.middleware, /destination\.pathname = "\/login\/ios"/, "middleware 必須把 iOS 導向靜態登入頁");
assert.match(sources.webViewModel, /\/workspace\?source=ios-app/, "iOS App 再次啟動時應優先沿用登入狀態進入工作區");
assert.match(sources.webView, /erinPerformanceStyle/, "iOS WKWebView 必須停用高成本背景特效");
assert.match(sources.layout, /medicalEnabled/, "登入後版面必須把平台能力傳給導覽列");
assert.match(sources.workspace, /medicalEnabled/, "工作區不得把 iOS 醫美租戶自動導向醫美頁");
assert.match(sources.sidebar, /medicalEnabled/, "桌面與行動側邊欄必須隱藏 iOS 醫美入口");
assert.match(sources.registerApi, /isIosAppRequest/, "註冊 API 必須拒絕 iOS 建立醫美租戶");
assert.match(sources.login, /!iosApp/, "iOS 登入頁不得顯示網頁金流入口");
assert.match(sources.login, /router\.replace\(path\)/, "iOS 登入後必須使用快速的 App 內導覽");
assert.match(sources.iosLogin, /LoginClient iosApp/, "iOS 必須使用不含網頁付款入口的靜態登入頁");
assert.match(sources.trialGate, /!iosApp/, "iOS 試用與到期畫面不得引導網頁付款");

console.log("iOS App medical isolation with full Vercel, Safari and desktop preservation: PASS");
