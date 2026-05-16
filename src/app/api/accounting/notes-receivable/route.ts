import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, requireTenantId, audit, nextNumber } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission("notes.view");
  const tenantId = await requireTenantId();
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q") ?? "";
  const status = sp.get("status") ?? "";
  const page = Number(sp.get("page") ?? 1);
  const pageSize = Number(sp.get("pageSize") ?? 20);
  const where: any = { tenantId };
  if (q) {
    where.OR = [
      { noteNumber: { contains: q, mode: "insensitive" } },
      { customer: { companyName: { contains: q, mode: "insensitive" } } },
      { bankName: { contains: q, mode: "insensitive" } },
    ];
  }
  if (status) where.status = status;
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
    },
  });
  await audit({ userId: session.user.id, action: "create", module: "notes-receivable", refId: created.id, detail: number });
  return NextResponse.json(created);
});
