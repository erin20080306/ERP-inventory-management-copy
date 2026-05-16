import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, audit, nextNumber } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission("receivables.view");
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q") ?? "";
  const page = Number(sp.get("page") ?? 1);
  const pageSize = Number(sp.get("pageSize") ?? 20);
  const where: any = q ? { customer: { companyName: { contains: q, mode: "insensitive" } } } : {};
  const [items, total] = await Promise.all([
    prisma.accountsReceivable.findMany({
      where,
      include: { customer: true, salesOrder: true, payments: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.accountsReceivable.count({ where }),
  ]);
  return NextResponse.json({ items, total });
});

// 收款
export const POST = apiHandler(async (req: NextRequest) => {
  const session = await requirePermission("receivables.edit");
  const body = await req.json();
  const { receivableId, amount, method, remark } = body;
  const ar = await prisma.accountsReceivable.findUnique({ where: { id: receivableId } });
  if (!ar) throw new Error("找不到應收帳款");
  const number = await nextNumber("RP");
  let paymentId: string | null = null;
  await prisma.$transaction(async (tx: any) => {
    const created = await tx.receivePayment.create({
      data: {
        number,
        customerId: ar.customerId,
        receivableId: ar.id,
        amount: Number(amount),
        method,
        remark,
      },
    });
    paymentId = created.id;
    const newPaid = Number(ar.paidAmount) + Number(amount);
    const status = newPaid >= Number(ar.amount) ? "PAID" : "PARTIAL";
    await tx.accountsReceivable.update({
      where: { id: ar.id },
      data: { paidAmount: newPaid, status },
    });
    if (status === "PAID" && ar.salesOrderId) {
      await tx.salesOrder.update({ where: { id: ar.salesOrderId }, data: { status: "PAID" } });
    }
  });
  await audit({ userId: session.user.id, action: "receive", module: "receivables", refId: receivableId, detail: number });
  return NextResponse.json({ ok: true, paymentId, number });
});
