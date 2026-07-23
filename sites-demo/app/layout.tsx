import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ATELIER NOIR｜品牌商城快速試用",
  description: "高速、可操作的服飾品牌商城試用站，包含商品、活動、購物車、付款介面、會員中心與訂單查詢。",
  applicationName: "Erin Commerce OS",
  openGraph: {
    title: "ATELIER NOIR｜品牌商城快速試用",
    description: "消費者商城試用：商品、活動、購物車、付款介面、會員與訂單查詢。",
    type: "website",
    locale: "zh_TW",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "ATELIER NOIR 品牌商城快速試用" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "ATELIER NOIR｜品牌商城快速試用",
    description: "由 Erin Commerce OS 打造的高速服飾商城試用站。",
    images: ["/og.png"],
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-TW">
      <body>{children}</body>
    </html>
  );
}
