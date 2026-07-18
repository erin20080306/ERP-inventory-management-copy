import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getSession } from "@/lib/api";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { PrintCompanyHeader } from "@/components/print-company-header";
import { TrialGate } from "@/components/trial-gate";
import { UpdateNotice } from "@/components/update-notice";
import { getLicenseAccessForUser, verifyLocalWorkstationRequest } from "@/lib/license";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session?.user) redirect("/login");
  let initialAccess = await getLicenseAccessForUser(session.user.id);
  if (initialAccess.allowed && process.env.LOCAL_LICENSE_MODE === "true" && session.user.tenantId && !session.user.isSuperAdmin) {
    const requestHeaders = await headers();
    const workstation = await verifyLocalWorkstationRequest(session.user.tenantId, {
      method: requestHeaders.get("x-erin-original-method") || "GET",
      path: requestHeaders.get("x-erin-original-path") || "/dashboard",
      headers: requestHeaders,
    });
    if (!workstation.allowed) {
      initialAccess = { ...initialAccess, status: "locked", allowed: false, reason: workstation.reason };
    }
  }
  return (
    <TrialGate initialAccess={initialAccess}>
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <Header showDownloads={initialAccess.status === "paid"} />
          <UpdateNotice />
          <main className="flex-1 p-6" data-erp-keyboard-scope>
            <PrintCompanyHeader />
            {children}
          </main>
        </div>
      </div>
    </TrialGate>
  );
}
