import type { Metadata } from "next";
import { FashionStorefront } from "./storefront";
import { getSession } from "@/lib/api";
import { canManageTenantStorefront } from "@/lib/storefront-access";
import { prisma } from "@/lib/prisma";
import { normalizeStoreSlug } from "@/lib/storefront-branding";
import { getLocale, getTranslations } from "next-intl/server";
import { localeAlternates } from "@/i18n/metadata";

type StorePageProps = {
  params: Promise<{ tenant: string; view?: string[] }>;
};

// 值為翻譯鍵；商城分頁標題會跟著訪客語言切換，網址則由 /en 前綴決定。
const VIEW_TITLE_KEYS: Record<string, string> = {
  home: "viewHome",
  products: "viewProducts",
  campaigns: "viewCampaigns",
  cart: "viewCart",
  checkout: "viewCheckout",
  member: "viewMember",
  orders: "viewOrders",
};

async function storefrontIdentity(rawKey: string) {
  const key = decodeURIComponent(rawKey).trim();
  return prisma.tenant.findFirst({
    where: {
      AND: [
        { OR: [{ isInternal: true }, { isInternal: false, businessMode: "ECOMMERCE" }] },
        { OR: [
          { id: key },
          { companyCode: key.toUpperCase() },
          { companySettings: { some: { storeSlug: normalizeStoreSlug(key) } } },
        ] },
      ],
    },
    select: {
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
  const [t, locale] = await Promise.all([getTranslations("storefront"), getLocale()]);
  const viewKey = VIEW_TITLE_KEYS[currentView];
  const viewTitle = viewKey ? t(viewKey) : t("fallbackTitle");
  const basePath = `/store/${encodeURIComponent(tenant)}${view.length ? `/${view.map(encodeURIComponent).join("/")}` : ""}`;
  return {
    title: `${viewTitle}｜${brand}`,
    description: t("metaDescription", { brand }),
    ...localeAlternates(basePath, locale),
  };
}

export default async function StorePage({ params }: StorePageProps) {
  const { tenant, view = [] } = await params;
  const [session, identity] = await Promise.all([getSession(), storefrontIdentity(tenant)]);
  const managerAccess = canManageTenantStorefront(session?.user, tenant);
  const managerBackHref = session?.user?.isSuperAdmin ? "/admin" : "/products";
  const managerErpHref = session?.user?.isSuperAdmin ? "/workspace" : "/dashboard";
  return <FashionStorefront tenant={tenant} initialView={view[0] || "home"} initialStoreName={identity?.companySettings[0]?.storeName || identity?.name} managerAccess={managerAccess} managerBackHref={managerBackHref} managerErpHref={managerErpHref} />;
}
