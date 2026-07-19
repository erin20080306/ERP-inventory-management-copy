import { NextResponse } from "next/server";
import { apiHandler, requireAuth, requireTenantId } from "@/lib/api";
import { ensureTenantBaseline, isTenantBaselineReady } from "@/lib/tenant-baseline";

export const dynamic = "force-dynamic";

export const GET = apiHandler(async () => {
  const session = await requireAuth();
  if (session.user.isSuperAdmin) {
    return NextResponse.json({ ready: true, status: "READY" }, { headers: { "Cache-Control": "no-store" } });
  }

  const tenantId = await requireTenantId(session);
  const ready = await isTenantBaselineReady(tenantId);
  return NextResponse.json(
    { ready, status: ready ? "READY" : "PENDING" },
    { headers: { "Cache-Control": "no-store" } },
  );
});

export const POST = apiHandler(async () => {
  const session = await requireAuth();
  if (session.user.isSuperAdmin) {
    return NextResponse.json({ ready: true, status: "READY" }, { headers: { "Cache-Control": "no-store" } });
  }

  const tenantId = await requireTenantId(session);
  if (await isTenantBaselineReady(tenantId)) {
    return NextResponse.json({ ready: true, status: "READY" }, { headers: { "Cache-Control": "no-store" } });
  }

  try {
    await ensureTenantBaseline(tenantId);
    return NextResponse.json(
      { ready: true, status: "READY" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[tenant-initialization] initialization failed", { tenantId, error });
    return NextResponse.json(
      {
        ready: false,
        status: "FAILED",
        error: "系統初始化尚未完成，請重新嘗試；已建立的資料會保留，不會重複建立。",
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
});
