import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { KeyRound } from "lucide-react";
import { getSession } from "@/lib/api";
import { verifyLocalWorkstationRequest } from "@/lib/license";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session?.user) redirect("/login");
  if (process.env.LOCAL_LICENSE_MODE === "true" && session.user.tenantId && !session.user.isSuperAdmin) {
    const requestHeaders = await headers();
    const workstation = await verifyLocalWorkstationRequest(session.user.tenantId, {
      method: requestHeaders.get("x-erin-original-method") || "GET",
      path: requestHeaders.get("x-erin-original-path") || "/admin",
      headers: requestHeaders,
    });
    if (!workstation.allowed) {
      return <main className="flex min-h-screen items-center justify-center bg-slate-950 p-8 text-white"><section className="max-w-lg rounded-2xl border border-rose-500/30 bg-slate-900 p-8"><h1 className="text-xl font-bold">工作站未授權</h1><p className="mt-3 text-slate-300">{workstation.reason}</p></section></main>;
    }
  }
  return (
    <>
      {children}
      {session.user.isSuperAdmin && (
        <Link href="/admin/license-activation?release=20260717-3" className="fixed bottom-5 right-5 z-[1200] inline-flex items-center gap-2 rounded-full border border-amber-300/30 bg-amber-400 px-4 py-3 text-sm font-bold text-slate-950 shadow-2xl transition hover:bg-amber-300">
          <KeyRound className="h-4 w-4" />方案開通／啟用碼
        </Link>
      )}
    </>
  );
}
