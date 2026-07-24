import { redirect } from "next/navigation";
import { getSession } from "@/lib/api";
import { AdminProductsClient } from "./products-client";

export default async function AdminProductsPage() {
  const session = await getSession();
  if (!session?.user) redirect("/login");
  if (!session.user.isSuperAdmin) redirect("/dashboard");
  return <AdminProductsClient />;
}
