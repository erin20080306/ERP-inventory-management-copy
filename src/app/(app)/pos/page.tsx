import { PosWorkspace } from "./pos-workspace";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/api";
import { hasPermission } from "@/lib/auth";
import { normalizeBusinessMode } from "@/lib/product-editions";

export const dynamic = "force-dynamic";

export default async function PosPage() {
  const session = await getSession();
  if (!session?.user) redirect("/login");
  const mode = normalizeBusinessMode(session.user.businessMode);
  if (!session.user.isSuperAdmin && mode === "POS_RESTAURANT") redirect("/pos/restaurant");
  if (!session.user.isSuperAdmin && mode === "ERP") redirect("/workspace");
  if (!hasPermission(session.user.permissions, "pos.view")) redirect("/workspace");
  return <PosWorkspace />;
}
