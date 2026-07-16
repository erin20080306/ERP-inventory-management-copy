import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/api";
import { verifyLocalWorkstationRequest } from "@/lib/license";
import "./print.css";

export default async function PrintLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session?.user) redirect("/login");
  if (process.env.LOCAL_LICENSE_MODE === "true" && session.user.tenantId) {
    const requestHeaders = await headers();
    const workstation = await verifyLocalWorkstationRequest(session.user.tenantId, {
      method: requestHeaders.get("x-erin-original-method") || "GET",
      path: requestHeaders.get("x-erin-original-path") || "/print",
      headers: requestHeaders,
    });
    if (!workstation.allowed) {
      return <main style={{ padding: 40, fontFamily: "sans-serif" }}><h1>工作站未授權</h1><p>{workstation.reason}</p></main>;
    }
  }
  return <div className="print-body">{children}</div>;
}
