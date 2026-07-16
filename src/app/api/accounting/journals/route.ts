import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, requireTenantId, audit, getCurrentUserId } from "@/lib/api";
import { lockAndAssertAccountingPeriodOpen } from "@/lib/accounting-controls";
import { nextNumberInTransaction } from "@/lib/documents";
import { prisma } from "@/lib/prisma";

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission("journals.view");
  const tenantId = await requireTenantId();
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q") ?? "";
  const page = Number(sp.get("page") ?? 1);
  const pageSize = Math.min(Number(sp.get("pageSize") ?? 20), 200);
  const fromDate = sp.get("from") ?? "";
  const toDate = sp.get("to") ?? "";
  
  const where: any = q ? { tenantId, OR: [{ number: { contains: q, mode: "insensitive" } }, { summary: { contains: q, mode: "insensitive" } }] } : { tenantId };
  
  if (fromDate || toDate) {
    where.entryDate = {};
    if (fromDate) where.entryDate.gte = new Date(fromDate);
    if (toDate) where.entryDate.lte = new Date(toDate);
  }
  
  const [items, total] = await Promise.all([
    prisma.journalEntry.findMany({
      where,
      select: {
        id: true,
        number: true,
        summary: true,
        entryDate: true,
        status: true,
        createdById: true,
        submittedById: true,
        submittedAt: true,
        approvedById: true,
        approvedAt: true,
        postedById: true,
        postedAt: true,
        reversedAt: true,
        updatedBy: true,
        createdBy: { select: { id: true, name: true, username: true } },
        reversal: { select: { id: true, number: true, entryDate: true } },
        reversalOf: { select: { id: true, number: true } },
        lines: {
          select: {
            id: true,
            accountId: true,
            debit: true,
            credit: true,
            memo: true,
            account: { select: { code: true, name: true } },
          },
        },
      },
      orderBy: { entryDate: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.journalEntry.count({ where }),
  ]);
  return NextResponse.json({ items, total });
});

export const POST = apiHandler(async (req: NextRequest) => {
  const session = await requirePermission("journals.create");
  const tenantId = await requireTenantId();
  const currentUserId = await getCurrentUserId();
  const body = await req.json();
  const { summary, entryDate, lines, attachment } = body as any;
  if (!lines?.length) throw new Error("請至少新增一筆分錄");
  const totalDebit = lines.reduce((s: number, l: any) => s + Number(l.debit ?? 0), 0);
  const totalCredit = lines.reduce((s: number, l: any) => s + Number(l.credit ?? 0), 0);
  if (Math.abs(totalDebit - totalCredit) > 0.001) throw new Error(`借貸不平衡 (借 ${totalDebit} / 貸 ${totalCredit})`);
  if (totalDebit === 0) throw new Error("金額不可為 0");
  const journalDate = entryDate ? new Date(entryDate) : new Date();
  const created = await prisma.$transaction(async (tx: any) => {
    await lockAndAssertAccountingPeriodOpen(tx, tenantId, journalDate);
    const accountIds = [...new Set(lines.map((line: any) => line.accountId))] as string[];
    const accountCount = await tx.chartOfAccount.count({ where: { tenantId, id: { in: accountIds }, isActive: true } });
    if (accountCount !== accountIds.length) throw new Error("分錄包含其他公司或已停用的會計科目");
    const number = await nextNumberInTransaction(tx, "JE", tenantId);
    return tx.journalEntry.create({
      data: {
        tenantId,
        number,
        summary: summary ?? "",
        entryDate: journalDate,
        attachment,
        createdById: session.user.id,
        updatedBy: currentUserId,
        status: "DRAFT",
        lines: {
          create: lines.map((line: any) => ({
            accountId: line.accountId,
            debit: Number(line.debit ?? 0),
            credit: Number(line.credit ?? 0),
            memo: line.memo,
          })),
        },
      },
      include: {
        lines: { include: { account: true } },
        createdBy: { select: { id: true, name: true, username: true } },
        reversal: { select: { id: true, number: true, entryDate: true } },
        reversalOf: { select: { id: true, number: true } },
      },
    });
  }, { isolationLevel: "ReadCommitted", maxWait: 10_000, timeout: 30_000 });
  await audit({ userId: session.user.id, action: "create", module: "journals", refId: created.id });
  return NextResponse.json(created);
});
