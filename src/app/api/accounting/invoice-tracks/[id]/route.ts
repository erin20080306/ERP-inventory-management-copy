import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, requireTenantId, audit } from "@/lib/api";
import { prisma } from "@/lib/prisma";

// 更新字軌
export const PUT = apiHandler(async (req: NextRequest, { params }: any) => {
  const session = await requirePermission("invoices.edit");
  const tenantId = await requireTenantId();
  const body = await req.json();
  const track = await prisma.invoiceTrack.findUnique({ where: { id: params.id } });
  if (!track || track.tenantId !== tenantId) throw new Error("找不到字軌");
  const updated = await prisma.invoiceTrack.update({
    where: { id: params.id },
    data: {
      isActive: body.isActive ?? track.isActive,
      endNumber: body.endNumber ? Number(body.endNumber) : track.endNumber,
    },
  });
  await audit({ userId: session.user.id, action: "update", module: "invoice-track", refId: track.id });
  return NextResponse.json(updated);
});

// 刪除字軌（僅在未使用時）
export const DELETE = apiHandler(async (_req: NextRequest, { params }: any) => {
  const session = await requirePermission("invoices.edit");
  const tenantId = await requireTenantId();
  const track = await prisma.invoiceTrack.findUnique({ where: { id: params.id } });
  if (!track || track.tenantId !== tenantId) throw new Error("找不到字軌");
  if (track.currentNum >= track.startNumber) throw new Error("字軌已有使用紀錄，無法刪除");
  await prisma.invoiceTrack.delete({ where: { id: params.id } });
  await audit({ userId: session.user.id, action: "delete", module: "invoice-track", refId: params.id });
  return NextResponse.json({ ok: true });
});
