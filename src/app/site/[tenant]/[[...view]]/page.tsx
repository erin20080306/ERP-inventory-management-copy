import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FashionStorefront } from "@/app/store/[tenant]/[[...view]]/storefront";
import { MedicalClinicSite } from "@/app/medical/[tenant]/[[...view]]/site";
import { getSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { normalizeBusinessMode, type BusinessMode } from "@/lib/product-editions";
import { medicalSiteUrl, publicStorefrontOrigin, storefrontUrl } from "@/lib/public-site-links";
import { canManageTenantMedicalSite, canManageTenantStorefront } from "@/lib/storefront-access";
import { normalizeStoreSlug } from "@/lib/storefront-branding";

type TenantSitePageProps = {
  params: Promise<{ tenant: string; view?: string[] }>;
};

const STORE_VIEW_TITLES: Record<string, string> = {
  home: "首頁",
  products: "商品",
  campaigns: "最新活動",
  cart: "購物車",
  checkout: "安心結帳",
  member: "會員中心",
  orders: "訂單查詢",
};

function demoMode(tenant: string): BusinessMode | null {
  const key = tenant.toLowerCase();
  if (["atelier-noir", "moon-form"].includes(key)) return "ECOMMERCE";
  if (key === "atelier-clinic") return "POS_MEDICAL";
  return null;
}

function demoName(tenant: string) {
  const key = tenant.toLowerCase();
  if (key === "moon-form") return "MOON FORM";
  if (key === "atelier-noir") return "ATELIER NOIR";
  if (key === "atelier-clinic") return "ATELIER CLINIC 艾緹雅醫美";
  return "";
}

async function tenantSiteIdentity(rawKey: string) {
  const key = decodeURIComponent(rawKey).trim();
  return prisma.tenant.findFirst({
    where: {
      AND: [
        {
          OR: [
            { isInternal: true },
            { isInternal: false, businessMode: { in: ["ECOMMERCE", "POS_MEDICAL"] } },
          ],
        },
        {
          OR: [
            { id: key },
            { companyCode: key.toUpperCase() },
            { companySettings: { some: { storeSlug: normalizeStoreSlug(key) } } },
          ],
        },
      ],
    },
    select: {
      id: true,
      name: true,
      businessMode: true,
      companyCode: true,
      isInternal: true,
      companySettings: {
        select: { storeName: true, storeSlug: true },
        take: 1,
      },
    },
  });
}

export async function generateMetadata({ params }: TenantSitePageProps): Promise<Metadata> {
  const { tenant, view = [] } = await params;
  const identity = await tenantSiteIdentity(tenant);
  const mode = identity ? normalizeBusinessMode(identity.businessMode) : demoMode(tenant);
  const name = identity?.companySettings[0]?.storeName || identity?.name || demoName(tenant) || "品牌網站";

  if (mode === "POS_MEDICAL") {
    return {
      title: `${name}｜專業諮詢與線上預約`,
      description: `${name} 專業醫美診所服務、服務項目與線上預約。`,
      alternates: { canonical: medicalSiteUrl(identity?.companySettings[0]?.storeSlug || tenant) },
    };
  }

  const currentView = view[0] || "home";
  return {
    title: `${STORE_VIEW_TITLES[currentView] || "線上商店"}｜${name}`,
    description: `${name} 品牌商城，提供線上選購、付款、會員服務與訂單查詢。`,
    alternates: { canonical: storefrontUrl(identity?.companySettings[0]?.storeSlug || tenant) },
  };
}

export default async function TenantSitePage({ params }: TenantSitePageProps) {
  const { tenant, view = [] } = await params;
  const [session, identity] = await Promise.all([getSession(), tenantSiteIdentity(tenant)]);
  const mode = identity ? normalizeBusinessMode(identity.businessMode) : demoMode(tenant);
  if (!mode || !["ECOMMERCE", "POS_MEDICAL"].includes(mode)) notFound();

  const appOrigin = publicStorefrontOrigin();
  const storeName = identity?.companySettings[0]?.storeName || identity?.name || demoName(tenant) || undefined;

  if (mode === "POS_MEDICAL") {
    const managerAccess = canManageTenantMedicalSite(session?.user, tenant);
    const managerErpHref = `${appOrigin}${session?.user?.isSuperAdmin ? "/workspace" : "/medical"}`;
    return <MedicalClinicSite tenant={tenant} managerAccess={managerAccess} managerErpHref={managerErpHref} />;
  }

  const managerAccess = canManageTenantStorefront(session?.user, tenant);
  const managerBackHref = `${appOrigin}${session?.user?.isSuperAdmin ? "/admin" : "/products"}`;
  const managerErpHref = `${appOrigin}${session?.user?.isSuperAdmin ? "/workspace" : "/dashboard"}`;
  return (
    <FashionStorefront
      tenant={tenant}
      initialView={view[0] || "home"}
      initialStoreName={storeName}
      managerAccess={managerAccess}
      managerBackHref={managerBackHref}
      managerErpHref={managerErpHref}
    />
  );
}
