const createNextIntlPlugin = require("next-intl/plugin");

// 採「無語言路由」模式：後台網址維持不變，語言由使用者設定與 Cookie 決定；
// 只有對外官網／商城會在中介層加上 /en 前綴（見 src/i18n/routing.ts）。
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  outputFileTracingRoot: __dirname,
  images: { remotePatterns: [{ protocol: "https", hostname: "**" }] },
  experimental: { serverActions: { bodySizeLimit: "5mb" } },
  // 既有專案仍有大量樣式／未使用變數 lint 債；型別檢查另由 tsc 與 CI 執行。
  eslint: { ignoreDuringBuilds: true },
};
module.exports = withNextIntl(nextConfig);
