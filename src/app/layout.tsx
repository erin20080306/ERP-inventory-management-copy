import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Providers } from "@/components/providers";
import { SWRegister } from "@/components/sw-register";

export const metadata: Metadata = {
  title: "專業 ERP 進銷存會計管理系統",
  description: "雲端 ERP 系統，涵蓋商品、採購、銷售、庫存、會計、報表與權限管理。",
  applicationName: "ERP 系統",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "ERP 系統",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [{ url: "/icon-192", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icon-192", sizes: "192x192", type: "image/png" }],
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#4f46e5" },
    { media: "(prefers-color-scheme: dark)", color: "#0f172a" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-TW" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
        <SWRegister />
      </body>
    </html>
  );
}
