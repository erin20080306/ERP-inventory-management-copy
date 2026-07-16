import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getLicenseAccessForUser, verifyLocalWorkstationRequest } from "@/lib/license";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ status: "no_session", allowed: false }, { status: 401 });
  if (process.env.LOCAL_LICENSE_MODE === "true" && session.user.tenantId) {
    const workstation = await verifyLocalWorkstationRequest(session.user.tenantId, {
      method: req.method,
      path: `${req.nextUrl.pathname}${req.nextUrl.search}`,
      headers: req.headers,
    });
    if (!workstation.allowed) return NextResponse.json({ status: "locked", allowed: false, reason: workstation.reason }, { status: 403 });
  }
  return NextResponse.json(await getLicenseAccessForUser(session.user.id), {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
