import { NextResponse } from "next/server";
import { apiHandler, requireAuth, requireTenantId } from "@/lib/api";
import { ensureTenantBaseline, getTenantBaselineStatus } from "@/lib/tenant-baseline";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

export const GET = apiHandler(async () => {
  const session = await requireAuth();
  if (session.user.isSuperAdmin) {
    return NextResponse.json({ ready: true, status: "READY", durationMs: 0 }, { headers: noStore });
  }

  const tenantId = await requireTenantId(session);
  const status = await getTenantBaselineStatus(tenantId);
  return NextResponse.json(status, { headers: noStore });
});

export const POST = apiHandler(async () => {
  const session = await requireAuth();
  if (session.user.isSuperAdmin) {
    return NextResponse.json({ ready: true, status: "READY", durationMs: 0 }, { headers: noStore });
  }

  const tenantId = await requireTenantId(session);
  const current = await getTenantBaselineStatus(tenantId);
  if (current.ready) return NextResponse.json(current, { headers: noStore });

  try {
    const result = await ensureTenantBaseline(tenantId);
    return NextResponse.json(
      { ...result, status: "READY" },
      { headers: noStore },
    );
  } catch (error) {
    console.error("[tenant-initialization] initialization failed", { tenantId, error });
    const failed = await getTenantBaselineStatus(tenantId);
    return NextResponse.json(
      {
        ...failed,
        ready: false,
        status: "FAILED",
        error: "系統初始化尚未完成，請重新嘗試；已建立的資料會保留，不會重複建立。",
      },
      { status: 500, headers: noStore },
    );
  }
});
