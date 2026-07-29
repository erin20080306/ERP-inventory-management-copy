import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getSession } from "@/lib/api";
import { normalizeBusinessMode } from "@/lib/product-editions";
import { medicalSitePath } from "@/lib/public-site-links";
import { MedicalWorkspace } from "./medical-workspace";
import { isMedicalEnabledForRequest } from "@/lib/client-platform";

export const dynamic = "force-dynamic";

export default async function MedicalPage() {
  const session = await getSession();
  if (!session?.user) redirect("/login");
  if (!isMedicalEnabledForRequest(await headers())) redirect("/workspace");
  if (!session.user.isSuperAdmin && normalizeBusinessMode(session.user.businessMode) !== "POS_MEDICAL") redirect("/workspace");
  const tenantKey = session.user.companyCode || session.user.tenantId || "atelier-clinic";
  return <MedicalWorkspace publicSiteHref={medicalSitePath(tenantKey)} tenantCacheKey={session.user.tenantId || tenantKey} />;
}
