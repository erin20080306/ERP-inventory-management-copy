import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, audit } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const GET = apiHandler(async (_req: NextRequest, { params }: { params: { id: string } }) => {
  await requirePermission("assets.view");
  const a = await prisma.fixedAsset.findUnique({ where: { id: params.id } });
  if (!a) throw new Error("找不到資產");
  return NextResponse.json(a);
});

export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requirePermission("assets.edit");
  const body = await req.json();
  const { action, ...patch } = body;
  const a = await prisma.fixedAsset.findUnique({ where: { id: params.id } });
  if (!a) throw new Error("找不到資產");

  let data: any = {};
  if (action === "dispose") {
    const disposeAmount = Number(patch.disposeAmount ?? 0);
    data = {
      status: "DISPOSED",
      disposeDate: patch.disposeDate ? new Date(patch.disposeDate) : new Date(),
      disposeAmount,
    };
  } else if (action === "depreciate") {
    // 計提折舊一期
    const monthlyDep = computeMonthlyDepreciation(a);
    const newAccum = Number(a.accumulatedDepreciation) + monthlyDep;
    const newBook = Math.max(Number(a.residualValue), Number(a.acquireCost) - newAccum);
    data = { accumulatedDepreciation: newAccum, bookValue: newBook };
  } else {
    data = {
      name: patch.name,
      category: patch.category,
      accountCode: patch.accountCode,
      acquireDate: patch.acquireDate ? new Date(patch.acquireDate) : undefined,
      acquireCost: patch.acquireCost != null ? Number(patch.acquireCost) : undefined,
      residualValue: patch.residualValue != null ? Number(patch.residualValue) : undefined,
      usefulLifeMonths: patch.usefulLifeMonths != null ? Number(patch.usefulLifeMonths) : undefined,
      method: patch.method,
      location: patch.location,
      serialNumber: patch.serialNumber,
      status: patch.status,
      remark: patch.remark,
    };
    // 重算 bookValue (僅在未折舊時)
    if (data.acquireCost !== undefined) {
      data.bookValue = Number(data.acquireCost) - Number(a.accumulatedDepreciation);
    }
  }
  const updated = await prisma.fixedAsset.update({ where: { id: params.id }, data });
  await audit({ userId: session.user.id, action: action ?? "update", module: "fixed-assets", refId: params.id });
  return NextResponse.json(updated);
});

export const DELETE = apiHandler(async (_req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requirePermission("assets.delete");
  await prisma.fixedAsset.delete({ where: { id: params.id } });
  await audit({ userId: session.user.id, action: "delete", module: "fixed-assets", refId: params.id });
  return NextResponse.json({ ok: true });
});

function computeMonthlyDepreciation(a: any): number {
  const cost = Number(a.acquireCost);
  const residual = Number(a.residualValue ?? 0);
  const months = Number(a.usefulLifeMonths || 60);
  if (a.method === "DOUBLE_DECLINING") {
    const rate = (2 / months);
    return +(Number(a.bookValue) * rate).toFixed(2);
  }
  // STRAIGHT_LINE
  return +((cost - residual) / months).toFixed(2);
}
