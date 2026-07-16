import { requirePermission } from "@/lib/api";

export default async function PosDisplayLayout({ children }: { children: React.ReactNode }) {
  await requirePermission("sales.view");
  return children;
}
