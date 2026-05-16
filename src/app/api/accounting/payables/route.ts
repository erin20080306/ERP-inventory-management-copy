import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, audit, nextNumber } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission("payables.view");
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q") ?? "";
  const page = Number(sp.get("page") ?? 1);
  const pageSize = Number(sp.get("pageSize") ?? 20);
  const where: any = q ? { supplier: { companyName: { contains: q, mode: "insensitive" } } } : {};
  const [items, total] = await Promise.all([
    prisma.accountsPayable.findMany({
      where,
      include: { supplier: true, purchaseOrder: true, payments: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.accountsPayable.count({ where }),
  ]);
  return NextResponse.json({ items, total });
});

export const POST = apiHandler(async (req: NextRequest) => {
  const session = await requirePermission("payables.edit");
  const body = await req.json();
  const { payableId, amount, method, remark } = body;
  const ap = await prisma.accountsPayable.findUnique({ where: { id: payableId } });
  if (!ap) throw new Error("找不到應付帳款");
  const number = await nextNumber("SP");
  let paymentId: string | null = null;
  await prisma.$transaction(async (tx: any) => {
    const created = await tx.supplierPayment.create({
      data: { number, supplierId: ap.supplierId, payableId: ap.id, amount: Number(amount), method, remark },
    });
    paymentId = created.id;
    const newPaid = Number(ap.paidAmount) + Number(amount);
    const status = newPaid >= Number(ap.amount) ? "PAID" : "PARTIAL";
    await tx.accountsPayable.update({ where: { id: ap.id }, data: { paidAmount: newPaid, status } });
  });
  await audit({ userId: session.user.id, action: "pay", module: "payables", refId: payableId, detail: number });
  return NextResponse.json({ ok: true, paymentId, number });
});
