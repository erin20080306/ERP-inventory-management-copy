import { redirect } from "next/navigation";
import { getSession } from "@/lib/api";
import { hasPermission } from "@/lib/auth";
import { normalizeBusinessMode } from "@/lib/product-editions";
import { RestaurantEnhancements } from "../restaurant-enhancements";
import { RestaurantWorkspace } from "../restaurant-workspace";

export const dynamic = "force-dynamic";

export default async function KitchenPage() {
  const session = await getSession();
  if (!session?.user) redirect("/login");
  if (!session.user.isSuperAdmin && normalizeBusinessMode(session.user.businessMode) !== "POS_RESTAURANT") redirect("/workspace");
  if (!hasPermission(session.user.permissions, "restaurant.view")) redirect("/workspace");
  return (
    <>
      <RestaurantEnhancements />
      <RestaurantWorkspace kitchenOnly />
    </>
  );
}
