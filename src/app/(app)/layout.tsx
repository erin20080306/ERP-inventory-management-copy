import { redirect } from "next/navigation";
import { getSession } from "@/lib/api";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { PrintCompanyHeader } from "@/components/print-company-header";
import { TrialGate } from "@/components/trial-gate";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session?.user) redirect("/login");
  return (
    <TrialGate>
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <Header />
          <main className="flex-1 p-6">
            <PrintCompanyHeader />
            {children}
          </main>
        </div>
      </div>
    </TrialGate>
  );
}
