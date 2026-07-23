import { NextRequest, NextResponse } from "next/server";
import { ApiError, apiHandler, audit, getCurrentUserId, requirePermission, requireTenantId } from "@/lib/api";
import { lockAndAssertAccountingPeriodOpen } from "@/lib/accounting-controls";
import { createPostedJournal } from "@/lib/documents";
import {
  computeSuggestedDepreciation,
  depreciationPeriod,
  parseDepreciationDate,
  preferredAccumulatedAccountCode,
  roundDepreciationMoney,
} from "@/lib/fixed-asset-depreciation";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function assertDepreciableAsset(asset: any, date: Date) {
  if (asset.status !== "IN_USE") throw new ApiError(409, "只有使用中的資產可以提列折舊");
  if (asset.method === "NONE") throw new ApiError(409, "此資產設定為不提列折舊");
  if (date.getTime() < new Date(asset.acquireDate).getTime()) throw new ApiError(400, "折舊日期不可早於資產取得日");
  if (Number(asset.bookValue) <= Number(asset.residualValue)) throw new ApiError(409, "此資產已達殘值，不可再提列折舊");
}

function requestedDepreciationDate(value: unknown) {
  try {
    return parseDepreciationDate(value);
  } catch (error) {
    throw new ApiError(400, error instanceof Error ? error.message : "折舊日期不正確");
  }
}

async function depreciationPreview(tenantId: string, assetId: string, date: Date, client: any = prisma) {
  const asset = await client.fixedAsset.findFirst({ where: { id: assetId, tenantId } });
  if (!asset) throw new ApiError(404, "找不到固定資產");
  assertDepreciableAsset(asset, date);
  const period = depreciationPeriod(date);
  const [existing, latestDepreciation, confirmedPeriods] = await Promise.all([
    client.fixedAssetDepreciation.findUnique({
      where: { tenantId_fixedAssetId_period: { tenantId, fixedAssetId: asset.id, period } },
      select: { id: true, status: true },
    }),
    client.fixedAssetDepreciation.findFirst({
      where: { tenantId, fixedAssetId: asset.id, status: { not: "REVERSED" } },
      select: { period: true },
      orderBy: [{ depreciationDate: "desc" }, { createdAt: "desc" }],
    }),
    client.fixedAssetDepreciation.count({
      where: { tenantId, fixedAssetId: asset.id, status: { not: "REVERSED" } },
    }),
  ]);
  if (existing) throw new ApiError(409, `${period} 已有折舊紀錄，不可重複提列`);
  if (latestDepreciation && period < latestDepreciation.period) {
    throw new ApiError(409, `已有較後期的 ${latestDepreciation.period} 折舊，請依期間順序提列`);
  }
  const calculation = computeSuggestedDepreciation(asset, confirmedPeriods);
  if (calculation.amount <= 0) throw new ApiError(409, "此資產已無可提列折舊金額");
  return { asset, period, confirmedPeriods, calculation };
}

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission("assets.view");
  const tenantId = await requireTenantId();
  const sp = req.nextUrl.searchParams;
  const page = Math.max(1, Number(sp.get("page") ?? 1));
  const pageSize = Math.min(200, Math.max(1, Number(sp.get("pageSize") ?? 20)));
  const q = String(sp.get("q") ?? "").trim();
  const status = String(sp.get("status") ?? "").trim();
  const where: any = { tenantId };
  if (status) where.status = status;
  if (q) {
    where.OR = [
      { period: { contains: q } },
      { fixedAsset: { code: { contains: q, mode: "insensitive" } } },
      { fixedAsset: { name: { contains: q, mode: "insensitive" } } },
      { journalEntry: { number: { contains: q, mode: "insensitive" } } },
    ];
  }
  const [items, total] = await Promise.all([
    prisma.fixedAssetDepreciation.findMany({
      where,
      include: {
        fixedAsset: { select: { id: true, code: true, name: true, category: true } },
        journalEntry: { select: { id: true, number: true, status: true, entryDate: true } },
      },
      orderBy: [{ depreciationDate: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.fixedAssetDepreciation.count({ where }),
  ]);
  return NextResponse.json({ items, total });
});

export const POST = apiHandler(async (req: NextRequest) => {
  const body = await req.json();
  const action = String(body.action ?? "");

  if (action === "preview") {
    await requirePermission("assets.edit");
    const tenantId = await requireTenantId();
    const date = requestedDepreciationDate(body.depreciationDate);
    const preview = await depreciationPreview(tenantId, String(body.assetId ?? ""), date);
    const accounts = await prisma.chartOfAccount.findMany({
      where: { tenantId, isActive: true, type: { in: ["ASSET", "EXPENSE"] } },
      select: { code: true, name: true, type: true },
      orderBy: { code: "asc" },
    });
    const expenseAccounts = accounts.filter((account) => account.type === "EXPENSE");
    const allAssetAccounts = accounts.filter((account) => account.type === "ASSET");
    const accumulatedAccounts = allAssetAccounts.filter((account) => account.name.includes("累計折舊"));
    const preferredAccumulated = preferredAccumulatedAccountCode(preview.asset);
    const expenseAccount = expenseAccounts.find((account) => account.name.includes("折舊"))
      ?? expenseAccounts.find((account) => account.code === "6124")
      ?? null;
    const accumulatedAccount = accumulatedAccounts.find((account) => account.code === preferredAccumulated)
      ?? accumulatedAccounts[0]
      ?? null;
    return NextResponse.json({
      asset: preview.asset,
      period: preview.period,
      confirmedPeriods: preview.confirmedPeriods,
      ...preview.calculation,
      expenseAccountCode: expenseAccount?.code ?? "",
      accumulatedAccountCode: accumulatedAccount?.code ?? "",
      expenseAccounts,
      accumulatedAccounts: accumulatedAccounts.length ? accumulatedAccounts : allAssetAccounts,
    });
  }

  if (action === "confirm") {
    const session = await requirePermission("assets.edit");
    const tenantId = await requireTenantId(session);
    const updatedBy = await getCurrentUserId();
    const assetId = String(body.assetId ?? "");
    const date = requestedDepreciationDate(body.depreciationDate);
    const period = depreciationPeriod(date);
    const amount = roundDepreciationMoney(Number(body.amount));
    const expenseAccountCode = String(body.expenseAccountCode ?? "").trim();
    const accumulatedAccountCode = String(body.accumulatedAccountCode ?? "").trim();
    if (!Number.isFinite(amount) || amount <= 0) throw new ApiError(400, "折舊金額必須大於 0");
    if (!expenseAccountCode || !accumulatedAccountCode) throw new ApiError(400, "請選擇折舊費用與累計折舊科目");

    const created = await prisma.$transaction(async (tx: any) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`asset-depreciation:${tenantId}:${assetId}:${period}`}))`;
      await lockAndAssertAccountingPeriodOpen(tx, tenantId, date);
      const preview = await depreciationPreview(tenantId, assetId, date, tx);
      if (amount - preview.calculation.remaining > 0.001) {
        throw new ApiError(400, `折舊金額不可超過剩餘可折舊金額 ${preview.calculation.remaining}`);
      }
      const selectedAccounts = await tx.chartOfAccount.findMany({
        where: { tenantId, code: { in: [expenseAccountCode, accumulatedAccountCode] }, isActive: true },
        select: { code: true, type: true, name: true },
      });
      const expense = selectedAccounts.find((account: any) => account.code === expenseAccountCode);
      const accumulated = selectedAccounts.find((account: any) => account.code === accumulatedAccountCode);
      if (expense?.type !== "EXPENSE") throw new ApiError(400, "折舊費用科目必須是費用類");
      if (accumulated?.type !== "ASSET" || !accumulated.name.includes("累計折舊")) {
        throw new ApiError(400, "貸方科目必須是資產類的累計折舊科目");
      }
      const closingBookValue = roundDepreciationMoney(Math.max(
        Number(preview.asset.residualValue),
        Number(preview.asset.bookValue) - amount,
      ));
      const depreciation = await tx.fixedAssetDepreciation.create({
        data: {
          tenantId,
          fixedAssetId: preview.asset.id,
          period,
          depreciationDate: date,
          amount,
          openingBookValue: Number(preview.asset.bookValue),
          closingBookValue,
          method: preview.asset.method,
          expenseAccountCode,
          accumulatedAccountCode,
          status: "CONFIRMED",
          note: String(body.note ?? "").trim() || null,
          createdById: session.user.id,
        },
        include: { fixedAsset: { select: { code: true, name: true } } },
      });
      await tx.fixedAsset.update({
        where: { id: preview.asset.id },
        data: {
          accumulatedDepreciation: roundDepreciationMoney(Number(preview.asset.accumulatedDepreciation) + amount),
          bookValue: closingBookValue,
          updatedBy,
        },
      });
      return depreciation;
    }, { isolationLevel: "Serializable", maxWait: 10_000, timeout: 30_000 });
    await audit({ userId: session.user.id, action: "confirm_depreciation", module: "fixed-assets", refId: created.id, detail: `${created.period}; amount=${created.amount}` });
    return NextResponse.json(created);
  }

  if (action === "post") {
    const session = await requirePermission("journals.post");
    const tenantId = await requireTenantId(session);
    const depreciationId = String(body.depreciationId ?? "");
    const result = await prisma.$transaction(async (tx: any) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`asset-depreciation-post:${tenantId}:${depreciationId}`}))`;
      const depreciation = await tx.fixedAssetDepreciation.findFirst({
        where: { id: depreciationId, tenantId },
        include: { fixedAsset: true, journalEntry: true },
      });
      if (!depreciation) throw new ApiError(404, "找不到折舊紀錄");
      if (depreciation.status === "POSTED" && depreciation.journalEntry) {
        return { depreciation, journal: depreciation.journalEntry, current: true };
      }
      if (depreciation.status !== "CONFIRMED") throw new ApiError(409, "只有已確認且尚未切製傳票的折舊可以入帳");
      const journal = await createPostedJournal(
        tx,
        tenantId,
        `提列折舊 ${depreciation.period}－${depreciation.fixedAsset.code} ${depreciation.fixedAsset.name}`,
        session.user.id,
        [
          {
            code: depreciation.expenseAccountCode,
            debit: Number(depreciation.amount),
            memo: `${depreciation.fixedAsset.code} ${depreciation.fixedAsset.name} ${depreciation.period} 折舊`,
          },
          {
            code: depreciation.accumulatedAccountCode,
            credit: Number(depreciation.amount),
            memo: `${depreciation.fixedAsset.code} ${depreciation.fixedAsset.name} 累計折舊`,
          },
        ],
        depreciation.depreciationDate,
      );
      const updated = await tx.fixedAssetDepreciation.update({
        where: { id: depreciation.id },
        data: {
          status: "POSTED",
          journalEntryId: journal.id,
          postedById: session.user.id,
          postedAt: new Date(),
        },
        include: { fixedAsset: true, journalEntry: true },
      });
      return { depreciation: updated, journal, current: false };
    }, { isolationLevel: "Serializable", maxWait: 10_000, timeout: 30_000 });
    await audit({ userId: session.user.id, action: "post_depreciation_journal", module: "fixed-assets", refId: result.depreciation.id, detail: result.journal.number });
    return NextResponse.json(result);
  }

  throw new ApiError(400, "不支援的折舊動作");
});
