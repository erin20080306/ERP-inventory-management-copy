import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, requireTenantId, audit, nextNumber } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission("journals.view");
  const tenantId = await requireTenantId();
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q") ?? "";
  const page = Number(sp.get("page") ?? 1);
  const pageSize = Number(sp.get("pageSize") ?? 20);
  const where: any = q ? { tenantId, OR: [{ number: { contains: q, mode: "insensitive" } }, { summary: { contains: q, mode: "insensitive" } }] } : { tenantId };
  const [items, total] = await Promise.all([
    prisma.journalEntry.findMany({
      where,
      include: { lines: { include: { account: true } } },
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
  const body = await req.json();
  const { summary, entryDate, lines, attachment } = body as any;
  if (!lines?.length) throw new Error("請至少新增一筆分錄");
  const totalDebit = lines.reduce((s: number, l: any) => s + Number(l.debit ?? 0), 0);
  const totalCredit = lines.reduce((s: number, l: any) => s + Number(l.credit ?? 0), 0);
  if (Math.abs(totalDebit - totalCredit) > 0.001) throw new Error(`借貸不平衡 (借 ${totalDebit} / 貸 ${totalCredit})`);
  if (totalDebit === 0) throw new Error("金額不可為 0");
  const number = await nextNumber("JE", tenantId);
  const created = await prisma.journalEntry.create({
    data: {
      tenantId,
      number,
      summary: summary ?? "",
      entryDate: entryDate ? new Date(entryDate) : new Date(),
      attachment,
      createdById: session.user.id,
      status: "DRAFT",
      lines: {
        create: lines.map((l: any) => ({
          accountId: l.accountId,
          debit: Number(l.debit ?? 0),
          credit: Number(l.credit ?? 0),
          memo: l.memo,
        })),
      },
    },
    include: { lines: true },
  });
  await audit({ userId: session.user.id, action: "create", module: "journals", refId: created.id });
  return NextResponse.json(created);
});
