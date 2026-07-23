import type { Metadata } from "next";
import { FashionStorefront } from "./storefront";
import { getSession } from "@/lib/api";
import { canManageTenantStorefront } from "@/lib/storefront-access";
import { prisma } from "@/lib/prisma";
import { normalizeStoreSlug } from "@/lib/storefront-branding";

type StorePageProps = {
  params: Promise<{ tenant: string; view?: string[] }>;
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

async function storefrontIdentity(rawKey: string) {
  const key = decodeURIComponent(rawKey).trim();
  return prisma.tenant.findFirst({
    where: {
      isInternal: false,
      businessMode: "ECOMMERCE",
      OR: [
        { id: key },
        { companyCode: key.toUpperCase() },
        { companySettings: { some: { storeSlug: normalizeStoreSlug(key) } } },
      ],
    },
    select: {
      id: true,
      name: true,
      companySettings: { select: { storeName: true, storeSlug: true }, take: 1 },
    },
  });
}

export async function generateMetadata({ params }: StorePageProps): Promise<Metadata> {
  const { tenant, view = [] } = await params;
  const currentView = view[0] || "home";
  const identity = await storefrontIdentity(tenant);
  const brand = identity?.companySettings[0]?.storeName || identity?.name || (tenant === "moon-form" ? "MOON FORM" : "ATELIER NOIR");
  return {
    title: `${VIEW_TITLES[currentView] || "線上商店"}｜${brand}`,
    description: `${brand} 服飾電商示範店，整合購物車、付款、會員、訂單與 ERP 即時庫存。`,
  };
}

export default async function StorePage({ params }: StorePageProps) {
  const { tenant, view = [] } = await params;
  const [session, identity] = await Promise.all([getSession(), storefrontIdentity(tenant)]);
  const managerAccess = canManageTenantStorefront(session?.user, tenant)
    || Boolean(!session?.user?.isSuperAdmin && identity?.id && session?.user?.tenantId === identity.id);
  const managerBackHref = session?.user?.isSuperAdmin ? "/admin" : "/products";
  const managerErpHref = session?.user?.isSuperAdmin ? "/workspace" : "/dashboard";
  return <FashionStorefront tenant={tenant} initialView={view[0] || "home"} initialStoreName={identity?.companySettings[0]?.storeName || identity?.name} managerAccess={managerAccess} managerBackHref={managerBackHref} managerErpHref={managerErpHref} />;
}
