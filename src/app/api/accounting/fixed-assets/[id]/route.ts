import { NextRequest, NextResponse } from "next/server";
import { ApiError, apiHandler, requirePermission, requireTenantId, audit } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const GET = apiHandler(async (_req: NextRequest, { params }: { params: { id: string } }) => {
  await requirePermission("assets.view");
  const tenantId = await requireTenantId();
  const a = await prisma.fixedAsset.findUnique({ where: { id: params.id, tenantId } });
  if (!a) throw new Error("找不到資產");
  return NextResponse.json(a);
});

export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requirePermission("assets.edit");
  const tenantId = await requireTenantId();
  const body = await req.json();
  const { action, ...patch } = body;
  const a = await prisma.fixedAsset.findUnique({ where: { id: params.id, tenantId } });
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
    throw new ApiError(400, "請使用折舊確認流程提列，避免未經確認直接修改資產帳面價值");
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
  const updated = await prisma.fixedAsset.update({ where: { id: params.id, tenantId }, data });
  await audit({ userId: session.user.id, action: action ?? "update", module: "fixed-assets", refId: params.id });
  return NextResponse.json(updated);
});

export const DELETE = apiHandler(async (_req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requirePermission("assets.delete");
  const tenantId = await requireTenantId();
  const depreciationCount = await prisma.fixedAssetDepreciation.count({ where: { tenantId, fixedAssetId: params.id } });
  if (depreciationCount > 0) throw new ApiError(409, "此資產已有折舊子帳，不可刪除；如有錯誤請以傳票沖銷並保留稽核軌跡");
  await prisma.fixedAsset.delete({ where: { id: params.id, tenantId } });
  await audit({ userId: session.user.id, action: "delete", module: "fixed-assets", refId: params.id });
  return NextResponse.json({ ok: true });
});
