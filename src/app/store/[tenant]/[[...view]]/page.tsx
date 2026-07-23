import type { Metadata } from "next";
import { FashionStorefront } from "./storefront";

type StorePageProps = {
  params: Promise<{ tenant: string; view?: string[] }>;
  searchParams?: Promise<{ managerPreview?: string | string[] }>;
};

const VIEW_TITLES: Record<string, string> = {
  home: "首頁",
  products: "商品",
  campaigns: "最新活動",
  cart: "購物車",
  checkout: "安心結帳",
  member: "會員中心",
  orders: "訂單查詢",
};

export async function generateMetadata({ params }: StorePageProps): Promise<Metadata> {
  const { tenant, view = [] } = await params;
  const currentView = view[0] || "home";
  const brand = tenant === "moon-form" ? "MOON FORM" : "ATELIER NOIR";
  return {
    title: `${VIEW_TITLES[currentView] || "線上商店"}｜${brand}`,
    description: `${brand} 服飾電商示範店，整合購物車、付款、會員、訂單與 ERP 即時庫存。`,
  };
}

export default async function StorePage({ params, searchParams }: StorePageProps) {
  const { tenant, view = [] } = await params;
  const query = searchParams ? await searchParams : undefined;
  const managerPreview = Array.isArray(query?.managerPreview) ? query?.managerPreview[0] === "1" : query?.managerPreview === "1";
  return <FashionStorefront tenant={tenant} initialView={view[0] || "home"} managerPreview={managerPreview} />;
}
