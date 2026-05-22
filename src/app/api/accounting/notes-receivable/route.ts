import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, requireTenantId, audit, nextNumber, getCurrentUserId } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission("notes.view");
  const tenantId = await requireTenantId();
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q") ?? "";
  const status = sp.get("status") ?? "";
  const page = Number(sp.get("page") ?? 1);
  const pageSize = Number(sp.get("pageSize") ?? 20);
  const fromDate = sp.get("from") ?? "";
  const toDate = sp.get("to") ?? "";
  const where: any = { tenantId };
  if (q) {
    where.OR = [
      { noteNumber: { contains: q, mode: "insensitive" } },
      { customer: { companyName: { contains: q, mode: "insensitive" } } },
      { bankName: { contains: q, mode: "insensitive" } },
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
    prisma.noteReceivable.findMany({
      where,
      include: { customer: true, receivable: true },
      orderBy: { dueDate: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.noteReceivable.count({ where }),
  ]);
  return NextResponse.json({ items, total });
});

export const POST = apiHandler(async (req: NextRequest) => {
  const session = await requirePermission("notes.create");
  const tenantId = await requireTenantId();
  const currentUserId = await getCurrentUserId();
  const body = await req.json();
  if (!body.customerId) throw new Error("請選擇客戶");
  if (!body.amount || Number(body.amount) <= 0) throw new Error("金額必須大於 0");
  if (!body.dueDate) throw new Error("請選擇到期日");
  const number = await nextNumber("NR", tenantId);
  const created = await prisma.noteReceivable.create({
    data: {
      tenantId,
      number,
      noteNumber: body.noteNumber || number,
      noteType: body.noteType ?? "CHECK",
      customerId: body.customerId,
      bankName: body.bankName,
      branchName: body.branchName,
      drawerName: body.drawerName,
      amount: Number(body.amount),
      issueDate: body.issueDate ? new Date(body.issueDate) : new Date(),
      dueDate: new Date(body.dueDate),
      status: "PENDING",
      receivableId: body.receivableId || null,
      remark: body.remark,
      updatedBy: currentUserId,
    },
  });
  await audit({ userId: session.user.id, action: "create", module: "notes-receivable", refId: created.id, detail: number });
  return NextResponse.json(created);
});

export const PUT = apiHandler(async (req: NextRequest) => {
  const session = await requirePermission("notes.edit");
  const tenantId = await requireTenantId();
  const currentUserId = await getCurrentUserId();
  const body = await req.json();
  const { id, customerId, noteNumber, noteType, bankName, branchName, drawerName, amount, issueDate, dueDate, remark } = body;
  if (!customerId) throw new Error("請選擇客戶");
  if (!amount || Number(amount) <= 0) throw new Error("金額必須大於 0");
  if (!dueDate) throw new Error("請選擇到期日");

  const existing = await prisma.noteReceivable.findUnique({ where: { id, tenantId } });
  if (!existing) throw new Error("票據不存在");

  const updated = await prisma.noteReceivable.update({
    where: { id, tenantId },
    data: {
      customerId,
      noteNumber: noteNumber || existing.number,
      noteType: noteType ?? existing.noteType,
      bankName,
      branchName,
      drawerName,
      amount: Number(amount),
      issueDate: issueDate ? new Date(issueDate) : existing.issueDate,
      dueDate: new Date(dueDate),
      remark,
      updatedBy: currentUserId,
    },
    include: { customer: true, receivable: true },
  });

  await audit({ userId: session.user.id, action: "update", module: "notes-receivable", refId: id, detail: existing.number });

  return NextResponse.json(updated);
});
