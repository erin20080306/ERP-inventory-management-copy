import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, apiHandler, requirePermission, requireTenantId, audit } from "@/lib/api";
import { prisma } from "@/lib/prisma";

const TrackInput = z.object({
  year: z.coerce.number().int().min(100).max(999),
  period: z.coerce.number().int().min(1).max(6),
  trackCode: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "字軌必須為 2 碼英文"),
  startNumber: z.coerce.number().int().min(0).max(99_999_999),
  endNumber: z.coerce.number().int().min(0).max(99_999_999),
  type: z.enum(["SALES", "PURCHASE"]).default("SALES"),
});

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
  const { year, period, trackCode, startNumber, endNumber, type } = TrackInput.parse(await req.json());
  if (startNumber > endNumber) throw new ApiError(400, "起始號不可大於結束號");

  const track = await prisma.invoiceTrack.create({
    data: {
      tenantId,
      year,
      period,
      trackCode,
      startNumber,
      endNumber,
      currentNum: startNumber - 1,
      type,
    },
  });
  await audit({ userId: session.user.id, action: "create", module: "invoice-track", refId: track.id, detail: `${year}-${period} ${trackCode}${String(startNumber).padStart(8, "0")}~${trackCode}${String(endNumber).padStart(8, "0")}` });
  return NextResponse.json(track);
});
