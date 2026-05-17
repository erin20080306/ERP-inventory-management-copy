import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, requireTenantId, audit } from "@/lib/api";
import { prisma } from "@/lib/prisma";

// 取得字軌列表
export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission("invoices.view");
  const tenantId = await requireTenantId();
  const items = await prisma.invoiceTrack.findMany({
    where: { tenantId },
    orderBy: [{ year: "desc" }, { period: "desc" }, { trackCode: "asc" }],
  });
  return NextResponse.json({ items });
});

// 新增字軌
export const POST = apiHandler(async (req: NextRequest) => {
  const session = await requirePermission("invoices.edit");
  const tenantId = await requireTenantId();
  const body = await req.json();
  const { year, period, trackCode, startNumber, endNumber, type } = body;

  if (!trackCode || trackCode.length !== 2) throw new Error("字軌必須為 2 碼英文");
  if (!year || !period || !startNumber || !endNumber) throw new Error("請填寫完整欄位");
  if (startNumber >= endNumber) throw new Error("起始號必須小於結束號");

  const track = await prisma.invoiceTrack.create({
    data: {
      tenantId,
      year: Number(year),
      period: Number(period),
      trackCode: trackCode.toUpperCase(),
      startNumber: Number(startNumber),
      endNumber: Number(endNumber),
      currentNum: Number(startNumber) - 1,
      type: type || "SALES",
    },
  });
  await audit({ userId: session.user.id, action: "create", module: "invoice-track", refId: track.id });
  return NextResponse.json(track);
});
