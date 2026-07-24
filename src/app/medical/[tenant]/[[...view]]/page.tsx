import type { Metadata } from "next";
import { getSession } from "@/lib/api";
import { canManageTenantMedicalSite } from "@/lib/storefront-access";
import { MedicalClinicSite } from "./site";

type MedicalSitePageProps = { params: Promise<{ tenant: string; view?: string[] }> };

export async function generateMetadata({ params }: MedicalSitePageProps): Promise<Metadata> {
  const { tenant } = await params;
  const demo = tenant.toLowerCase() === "atelier-clinic";
  return {
    title: `${demo ? "ATELIER CLINIC 艾緹雅醫美" : "醫美診所"}｜專業諮詢與線上預約`,
    description: "以專業、安全與充分溝通為核心的醫美診所服務，線上查看服務圖片並預約諮詢。",
  };
}

export default async function MedicalSitePage({ params }: MedicalSitePageProps) {
  const { tenant } = await params;
  const session = await getSession();
  const managerAccess = canManageTenantMedicalSite(session?.user, tenant)
    || Boolean(!session?.user?.isSuperAdmin && session?.user?.tenantId && session?.user?.companyCode?.toUpperCase() === tenant.toUpperCase());
  return <MedicalClinicSite tenant={tenant} managerAccess={managerAccess} managerErpHref={session?.user?.isSuperAdmin ? "/workspace" : "/medical"} />;
}
