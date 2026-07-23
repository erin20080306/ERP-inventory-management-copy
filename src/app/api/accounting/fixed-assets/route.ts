import { NextRequest, NextResponse } from "next/server";
import { DepreciationMethod } from "@prisma/client";
import { ApiError, apiHandler, requirePermission, requireTenantId, audit, getCurrentUserId } from "@/lib/api";
import { parseDepreciationDate } from "@/lib/fixed-asset-depreciation";
import { prisma } from "@/lib/prisma";

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission("assets.view");
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q") ?? "";
  const status = sp.get("status") ?? "";
  const page = Number(sp.get("page") ?? 1);
  const pageSize = Math.min(Number(sp.get("pageSize") ?? 20), 200);
  const fromDate = sp.get("from") ?? "";
  const toDate = sp.get("to") ?? "";
  const tenantId = await requireTenantId();
  const where: any = { tenantId };
  if (q) {
    where.OR = [
      { code: { contains: q, mode: "insensitive" } },
      { name: { contains: q, mode: "insensitive" } },
      { serialNumber: { contains: q, mode: "insensitive" } },
    ];
  }
  if (status) where.status = status;
  if (fromDate || toDate) {
    where.createdAt = {};
    if (fromDate) where.createdAt.gte = new Date(fromDate);
    if (toDate) {
      const end = new Date(toDate);
      end.setHours(23, 59, 59, 999);
      where.createdAt.lte = end;
    }
  }
  const [items, total] = await Promise.all([
    prisma.fixedAsset.findMany({ where, orderBy: { acquireDate: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.fixedAsset.count({ where }),
  ]);
  return NextResponse.json({ items, total });
});

export const POST = apiHandler(async (req: NextRequest) => {
  const session = await requirePermission("assets.create");
  const tenantId = await requireTenantId();
  const currentUserId = await getCurrentUserId();
  const body = await req.json();
  if (!body.code) throw new ApiError(400, "請輸入資產編號");
  if (!body.name) throw new ApiError(400, "請輸入資產名稱");
  if (!body.acquireCost || Number(body.acquireCost) <= 0) throw new ApiError(400, "取得成本必須大於 0");

  const cost = Number(body.acquireCost);
  const residual = Number(body.residualValue ?? 0);
  const usefulLifeMonths = Number(body.usefulLifeMonths ?? 60);
  const methodText = String(body.method ?? "STRAIGHT_LINE");
  let acquireDate = new Date();
  if (body.acquireDate) {
    try {
      const dateText = String(body.acquireDate);
      acquireDate = /^\d{4}-\d{2}-\d{2}$/.test(dateText)
        ? parseDepreciationDate(dateText)
        : new Date(dateText);
    } catch {
      throw new ApiError(400, "取得日期不正確");
    }
  }
  if (!Number.isFinite(cost)) throw new ApiError(400, "取得成本格式不正確");
  if (!Number.isFinite(residual) || residual < 0 || residual > cost) {
    throw new ApiError(400, "殘值必須介於 0 與取得成本之間");
  }
  if (!Number.isInteger(usefulLifeMonths) || usefulLifeMonths <= 0) {
    throw new ApiError(400, "耐用年限必須是大於 0 的月份");
  }
  if (!["STRAIGHT_LINE", "DOUBLE_DECLINING", "SUM_OF_YEARS", "NONE"].includes(methodText)) {
    throw new ApiError(400, "折舊方法不正確");
  }
  const method = methodText as DepreciationMethod;
  if (Number.isNaN(acquireDate.getTime())) throw new ApiError(400, "取得日期不正確");
  if (String(body.category ?? "") === "土地" && method !== "NONE") {
    throw new ApiError(400, "土地屬非折舊性資產，折舊方法請選擇「不折舊」");
  }

  const assetData = {
    code: body.code,
    name: body.name,
    category: body.category,
    accountCode: body.accountCode,
    acquireDate,
    acquireCost: cost,
    residualValue: residual,
    usefulLifeMonths,
    method,
    location: body.location,
    serialNumber: body.serialNumber,
    supplierId: body.supplierId || null,
    status: body.status ?? "IN_USE",
    remark: body.remark,
    sourceJournalId: body.sourceJournalId || null,
    updatedBy: currentUserId,
  };
  const upsert = req.nextUrl.searchParams.get("upsert") === "1";
  if (upsert) {
    const result = await prisma.fixedAsset.upsert({
      where: { tenantId_code: { tenantId, code: body.code } },
      update: assetData,
      create: { ...assetData, tenantId, accumulatedDepreciation: 0, bookValue: cost },
    });
    await audit({ userId: session.user.id, action: "upsert", module: "fixed-assets", refId: result.id });
    return NextResponse.json(result);
  }
  const created = await prisma.fixedAsset.create({
    data: { ...assetData, tenantId, accumulatedDepreciation: 0, bookValue: cost },
  });
  await audit({ userId: session.user.id, action: "create", module: "fixed-assets", refId: created.id });
  return NextResponse.json(created);
});
