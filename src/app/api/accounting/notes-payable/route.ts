import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, requireTenantId, audit, nextNumber, getCurrentUserId } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission("notes.view");
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
      { noteNumber: { contains: q, mode: "insensitive" } },
      { supplier: { companyName: { contains: q, mode: "insensitive" } } },
      { payeeName: { contains: q, mode: "insensitive" } },
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
    prisma.notePayable.findMany({
      where,
      include: { supplier: true, payable: true, bankAccount: true },
      orderBy: { dueDate: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.notePayable.count({ where }),
  ]);
  return NextResponse.json({ items, total });
});

export const POST = apiHandler(async (req: NextRequest) => {
  const session = await requirePermission("notes.create");
  const tenantId = await requireTenantId();
  const currentUserId = await getCurrentUserId();
  const body = await req.json();
  if (!body.supplierId) throw new Error("請選擇供應商");
  if (!body.amount || Number(body.amount) <= 0) throw new Error("金額必須大於 0");
  if (!body.dueDate) throw new Error("請選擇到期日");
  const number = await nextNumber("NP", tenantId);
  const created = await prisma.notePayable.create({
    data: {
      tenantId,
      number,
      noteNumber: body.noteNumber || number,
      noteType: body.noteType ?? "CHECK",
      supplierId: body.supplierId,
      bankAccountId: body.bankAccountId || null,
      payeeName: body.payeeName,
      amount: Number(body.amount),
      issueDate: body.issueDate ? new Date(body.issueDate) : new Date(),
      dueDate: new Date(body.dueDate),
      status: "DRAFT",
      payableId: body.payableId || null,
      remark: body.remark,
      updatedBy: currentUserId,
    },
  });
  await audit({ userId: session.user.id, action: "create", module: "notes-payable", refId: created.id, detail: number });
  return NextResponse.json(created);
});

export const PUT = apiHandler(async (req: NextRequest) => {
  const session = await requirePermission("notes.edit");
  const tenantId = await requireTenantId();
  const currentUserId = await getCurrentUserId();
  const body = await req.json();
  const { id, supplierId, noteNumber, noteType, bankAccountId, payeeName, amount, issueDate, dueDate, remark } = body;
  if (!supplierId) throw new Error("請選擇供應商");
  if (!amount || Number(amount) <= 0) throw new Error("金額必須大於 0");
  if (!dueDate) throw new Error("請選擇到期日");

  const existing = await prisma.notePayable.findUnique({ where: { id, tenantId } });
  if (!existing) throw new Error("票據不存在");

  const updated = await prisma.notePayable.update({
    where: { id, tenantId },
    data: {
      supplierId,
      noteNumber: noteNumber || existing.number,
      noteType: noteType ?? existing.noteType,
      bankAccountId,
      payeeName,
      amount: Number(amount),
      issueDate: issueDate ? new Date(issueDate) : existing.issueDate,
      dueDate: new Date(dueDate),
      remark,
      updatedBy: currentUserId,
    },
    include: { supplier: true, payable: true, bankAccount: true },
  });

  await audit({ userId: session.user.id, action: "update", module: "notes-payable", refId: id, detail: existing.number });

  return NextResponse.json(updated);
});
