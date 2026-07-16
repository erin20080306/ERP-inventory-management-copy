import { NextRequest, NextResponse } from "next/server";
import { ApiError, apiHandler, audit, requirePermission, requireTenantId } from "@/lib/api";
import {
  accountingPeriodLockKey,
  assertAccountingPeriodOpen,
  lockAccountingPeriod,
} from "@/lib/accounting-controls";
import { createPostedJournal } from "@/lib/documents";
import { prisma } from "@/lib/prisma";

async function lockOpenDates(tx: any, tenantId: string, dates: Date[]) {
  const uniqueDates = new Map<string, Date>();
  for (const date of dates) uniqueDates.set(accountingPeriodLockKey(tenantId, date), date);
  const ordered = [...uniqueDates.entries()].sort(([left], [right]) => left.localeCompare(right));
  for (const [, date] of ordered) await lockAccountingPeriod(tx, tenantId, date);
  for (const [, date] of ordered) await assertAccountingPeriodOpen(tenantId, date, tx);
}

async function assertTenantAccounts(tx: any, tenantId: string, lines: any[]) {
  const accountIds = [...new Set(lines.map((line) => line.accountId))] as string[];
  const count = await tx.chartOfAccount.count({ where: { tenantId, id: { in: accountIds }, isActive: true } });
  if (count !== accountIds.length) throw new ApiError(400, "分錄包含其他公司或已停用的會計科目");
}

function assertBalanced(lines: any[]) {
  if (!lines?.length) throw new ApiError(400, "請至少新增一筆分錄");
  const totalDebit = lines.reduce((sum: number, line: any) => sum + Number(line.debit || 0), 0);
  const totalCredit = lines.reduce((sum: number, line: any) => sum + Number(line.credit || 0), 0);
  if (Math.abs(totalDebit - totalCredit) > 0.001 || totalDebit === 0) {
    throw new ApiError(400, "借貸必須平衡且金額不可為 0");
  }
}

export const GET = apiHandler(async (_req: NextRequest, { params }: { params: { id: string } }) => {
  await requirePermission("journals.view");
  const tenantId = await requireTenantId();
  const entry = await prisma.journalEntry.findUnique({
    where: { id: params.id, tenantId },
    include: {
      lines: { include: { account: true } },
      createdBy: { select: { id: true, name: true, username: true } },
      reversal: { select: { id: true, number: true, entryDate: true, reversalReason: true } },
      reversalOf: { select: { id: true, number: true, entryDate: true } },
    },
  });
  if (!entry) throw new ApiError(404, "找不到傳票");
  return NextResponse.json(entry);
});

export const PUT = apiHandler(async (req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requirePermission("journals.edit");
  const tenantId = await requireTenantId(session);
  const { summary, entryDate, lines } = await req.json();
  assertBalanced(lines);
  const nextDate = new Date(entryDate);
  const updated = await prisma.$transaction(async (tx: any) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`journal:${tenantId}:${params.id}`}))`;
    const existing = await tx.journalEntry.findFirst({ where: { id: params.id, tenantId } });
    if (!existing) throw new ApiError(404, "找不到傳票");
    if (!["DRAFT", "REJECTED"].includes(existing.status)) throw new ApiError(409, "只有草稿或退回傳票可以修改");
    await lockOpenDates(tx, tenantId, [existing.entryDate, nextDate]);
    await assertTenantAccounts(tx, tenantId, lines);
    await tx.journalEntryLine.deleteMany({ where: { entryId: existing.id } });
    return tx.journalEntry.update({
      where: { id: existing.id },
      data: {
        summary,
        entryDate: nextDate,
        status: "DRAFT",
        submittedById: null,
        submittedAt: null,
        approvedById: null,
        approvedAt: null,
        lines: {
          create: lines.map((line: any) => ({
            accountId: line.accountId,
            debit: Number(line.debit || 0),
            credit: Number(line.credit || 0),
            memo: line.memo || "",
          })),
        },
      },
      include: { lines: { include: { account: true } } },
    });
  }, { isolationLevel: "ReadCommitted", maxWait: 10_000, timeout: 30_000 });
  await audit({ userId: session.user.id, action: "edit", module: "journals", refId: params.id });
  return NextResponse.json(updated);
});

export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: { id: string } }) => {
  const body = await req.json();
  const action = String(body.action ?? "");
  const permissionByAction: Record<string, string> = {
    submit: "journals.submit",
    approve: "journals.approve",
    reject: "journals.reject",
    post: "journals.post",
    void: "journals.void",
    reverse: "journals.void",
    "update-header": "journals.edit",
  };
  const requiredPermission = permissionByAction[action];
  if (!requiredPermission) throw new ApiError(400, "不支援的傳票動作");
  const session = await requirePermission(requiredPermission);
  const tenantId = await requireTenantId(session);

  const result = await prisma.$transaction(async (tx: any) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`journal:${tenantId}:${params.id}`}))`;
    const entry = await tx.journalEntry.findFirst({
      where: { id: params.id, tenantId },
      include: { lines: { include: { account: true } }, reversal: true },
    });
    if (!entry) throw new ApiError(404, "找不到傳票");

    if (action === "submit") {
      if (!["DRAFT", "REJECTED"].includes(entry.status)) throw new ApiError(409, "只有草稿或退回傳票可以送審");
      await lockOpenDates(tx, tenantId, [entry.entryDate]);
      return tx.journalEntry.update({
        where: { id: entry.id },
        data: { status: "SUBMITTED", submittedById: session.user.id, submittedAt: new Date(), approvedById: null, approvedAt: null },
      });
    }

    if (action === "approve") {
      if (entry.status !== "SUBMITTED") throw new ApiError(409, "只有已送審傳票可以核准");
      if (entry.createdById === session.user.id) throw new ApiError(409, "製單者不可核准自己的傳票，請由另一位具核准權限的人員處理");
      await lockOpenDates(tx, tenantId, [entry.entryDate]);
      return tx.journalEntry.update({
        where: { id: entry.id },
        data: { status: "APPROVED", approvedById: session.user.id, approvedAt: new Date() },
      });
    }

    if (action === "reject") {
      if (entry.status !== "SUBMITTED") throw new ApiError(409, "只有已送審傳票可以退回");
      await lockOpenDates(tx, tenantId, [entry.entryDate]);
      return tx.journalEntry.update({ where: { id: entry.id }, data: { status: "REJECTED", approvedById: null, approvedAt: null } });
    }

    if (action === "post") {
      if (entry.status !== "APPROVED") throw new ApiError(409, "只有已核准傳票可以過帳");
      await lockOpenDates(tx, tenantId, [entry.entryDate]);
      return tx.journalEntry.update({
        where: { id: entry.id },
        data: { status: "POSTED", postedById: session.user.id, postedAt: new Date() },
      });
    }

    if (action === "void") {
      if (entry.status === "POSTED") throw new ApiError(409, "已過帳傳票不可直接作廢，請使用反向傳票沖銷");
      if (entry.status === "VOIDED") throw new ApiError(409, "傳票已作廢");
      await lockOpenDates(tx, tenantId, [entry.entryDate]);
      return tx.journalEntry.update({ where: { id: entry.id }, data: { status: "VOIDED" } });
    }

    if (action === "reverse") {
      if (entry.status !== "POSTED") throw new ApiError(409, "只有已過帳傳票可以建立反向傳票");
      if (entry.reversal || entry.reversedAt) throw new ApiError(409, "此傳票已建立反向傳票，不可重複沖銷");
      const reason = String(body.reason ?? "").trim();
      if (reason.length < 2) throw new ApiError(400, "請輸入至少 2 個字的沖銷原因");
      const reversalDate = body.reversalDate ? new Date(body.reversalDate) : new Date();
      await lockOpenDates(tx, tenantId, [reversalDate]);
      const reversal = await createPostedJournal(
        tx,
        tenantId,
        `沖銷 ${entry.number}：${reason}`,
        session.user.id,
        entry.lines.map((line: any) => ({
          code: line.account.code,
          debit: Number(line.credit),
          credit: Number(line.debit),
          memo: `沖銷 ${entry.number} ${line.memo ?? ""}`.trim(),
        })),
        reversalDate,
      );
      await tx.journalEntry.update({
        where: { id: reversal.id },
        data: { reversalOfId: entry.id, reversalReason: reason },
      });
      await tx.journalEntry.update({
        where: { id: entry.id },
        data: { reversedById: session.user.id, reversedAt: new Date() },
      });
      return { ...entry, reversal: { id: reversal.id, number: reversal.number } };
    }

    if (action === "update-header") {
      if (!["DRAFT", "REJECTED"].includes(entry.status)) throw new ApiError(409, "只有草稿或退回傳票可以修改表頭");
      const nextDate = body.entryDate !== undefined ? new Date(body.entryDate) : entry.entryDate;
      await lockOpenDates(tx, tenantId, [entry.entryDate, nextDate]);
      const data: any = {};
      if (body.summary !== undefined) data.summary = body.summary;
      if (body.entryDate !== undefined) data.entryDate = nextDate;
      return tx.journalEntry.update({ where: { id: entry.id }, data });
    }

    throw new ApiError(400, "不支援的傳票動作");
  }, { isolationLevel: "ReadCommitted", maxWait: 10_000, timeout: 30_000 });

  await audit({ userId: session.user.id, action, module: "journals", refId: params.id, detail: body.reason });
  return NextResponse.json({ ok: true, item: result, message: action === "reverse" ? "反向傳票已建立，原傳票與沖銷軌跡均已保留" : "已處理" });
});

export const DELETE = apiHandler(async (_req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requirePermission("journals.delete");
  const tenantId = await requireTenantId(session);
  await prisma.$transaction(async (tx: any) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`journal:${tenantId}:${params.id}`}))`;
    const entry = await tx.journalEntry.findFirst({ where: { id: params.id, tenantId } });
    if (!entry) throw new ApiError(404, "找不到傳票");
    if (!["DRAFT", "REJECTED"].includes(entry.status)) {
      throw new ApiError(409, "送審後傳票必須保留稽核軌跡；未過帳請作廢，已過帳請建立反向傳票");
    }
    await lockOpenDates(tx, tenantId, [entry.entryDate]);
    await tx.journalEntry.delete({ where: { id: entry.id } });
  }, { isolationLevel: "ReadCommitted", maxWait: 10_000, timeout: 30_000 });
  await audit({ userId: session.user.id, action: "delete", module: "journals", refId: params.id });
  return NextResponse.json({ ok: true });
});
