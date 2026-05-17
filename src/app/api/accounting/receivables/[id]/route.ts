import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, requireTenantId, audit } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const DELETE = apiHandler(async (_req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requirePermission("receivables.edit");
  const tenantId = await requireTenantId();
  const ar = await prisma.accountsReceivable.findUnique({ where: { id: params.id } });
  if (!ar || ar.tenantId !== tenantId) throw new Error("找不到應收帳款");
  if (Number(ar.paidAmount) > 0) throw new Error("已有收款紀錄，無法刪除");
  await prisma.accountsReceivable.delete({ where: { id: params.id } });
  await audit({ userId: session.user.id, action: "delete", module: "receivables", refId: params.id });
  return NextResponse.json({ ok: true });
});
