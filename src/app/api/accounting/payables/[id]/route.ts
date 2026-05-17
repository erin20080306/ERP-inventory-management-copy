import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, requireTenantId, audit } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const DELETE = apiHandler(async (_req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requirePermission("payables.edit");
  const tenantId = await requireTenantId();
  const ap = await prisma.accountsPayable.findUnique({ where: { id: params.id } });
  if (!ap || ap.tenantId !== tenantId) throw new Error("找不到應付帳款");
  if (Number(ap.paidAmount) > 0) throw new Error("已有付款紀錄，無法刪除");
  await prisma.accountsPayable.delete({ where: { id: params.id } });
  await audit({ userId: session.user.id, action: "delete", module: "payables", refId: params.id });
  return NextResponse.json({ ok: true });
});
