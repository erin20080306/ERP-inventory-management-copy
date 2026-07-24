import { redirect } from "next/navigation";
import { getSession } from "@/lib/api";
import { normalizeBusinessMode } from "@/lib/product-editions";
import { MedicalWorkspace } from "./medical-workspace";

export const dynamic = "force-dynamic";

export default async function MedicalPage() {
  const session = await getSession();
  if (!session?.user) redirect("/login");
  if (!session.user.isSuperAdmin && normalizeBusinessMode(session.user.businessMode) !== "POS_MEDICAL") redirect("/workspace");
  const tenantKey = session.user.companyCode || session.user.tenantId || "atelier-clinic";
  return <MedicalWorkspace publicSiteHref={`/medical/${encodeURIComponent(tenantKey)}`} />;
}
