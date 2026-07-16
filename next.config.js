/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: __dirname,
  images: { remotePatterns: [{ protocol: "https", hostname: "**" }] },
  experimental: { serverActions: { bodySizeLimit: "5mb" } },
  // 既有專案仍有大量樣式／未使用變數 lint 債；型別檢查另由 tsc 與 CI 執行。
  eslint: { ignoreDuringBuilds: true },
};
module.exports = nextConfig;
