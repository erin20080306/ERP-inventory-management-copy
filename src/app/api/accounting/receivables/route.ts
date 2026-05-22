import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, requireTenantId, audit, nextNumber, getCurrentUserId } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { buildReceivePaymentDraft, buildDiscountNoteDraft, autoCreateJournal } from "@/lib/auto-journal";

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission("receivables.view");
  const tenantId = await requireTenantId();
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q") ?? "";
  const customerId = sp.get("customerId") ?? "";
  const statusFilter = sp.get("status") ?? "";
  const page = Number(sp.get("page") ?? 1);
  const pageSize = Number(sp.get("pageSize") ?? 20);
  const fromDate = sp.get("from") ?? "";
  const toDate = sp.get("to") ?? "";
  const where: any = { tenantId };
  if (q) where.customer = { companyName: { contains: q, mode: "insensitive" } };
  if (customerId) where.customerId = customerId;
  if (statusFilter) where.status = statusFilter;
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

// 收款（含折讓）
export const POST = apiHandler(async (req: NextRequest) => {
  const session = await requirePermission("receivables.edit");
  const tenantId = await requireTenantId();
  const currentUserId = await getCurrentUserId();
  const body = await req.json();
  const { receivableId, amount, discount, discountNote, method, remark } = body;
  const ar = await prisma.accountsReceivable.findUnique({
    where: { id: receivableId },
    include: { salesOrder: true },
  });
  if (!ar || ar.tenantId !== tenantId) throw new Error("找不到應收帳款");
  const totalWriteOff = Number(amount || 0) + Number(discount || 0);
  const balance = Number(ar.amount) - Number(ar.paidAmount);
  if (totalWriteOff > balance) throw new Error("沖帳金額不可大於未結款項");

  const number = await nextNumber("RP", tenantId);
  let paymentId: string | null = null;
  let discountId: string | null = null;

  await prisma.$transaction(async (tx: any) => {
    // 建立收款紀錄
    if (Number(amount) > 0) {
      const created = await tx.receivePayment.create({
        data: {
          tenantId, number, customerId: ar.customerId, receivableId: ar.id,
          amount: Number(amount), method, remark, updatedBy: currentUserId,
        },
      });
      paymentId = created.id;
    }
    // 建立折讓單
    if (Number(discount) > 0) {
      const dnNumber = await nextNumber("DN", tenantId);
      const dn = await tx.discountNote.create({
        data: {
          tenantId, number: dnNumber, type: "SALES",
          customerId: ar.customerId, receivableId: ar.id,
          amount: Number(discount), reason: discountNote || null,
          relNumber: ar.salesOrder?.number || null,
        },
      });
      discountId = dn.id;
    }
    // 更新應收帳款
    const newPaid = Number(ar.paidAmount) + totalWriteOff;
    const status = newPaid >= Number(ar.amount) ? "PAID" : "PARTIAL";
    await tx.accountsReceivable.update({
      where: { id: ar.id },
      data: { paidAmount: newPaid, status, updatedBy: currentUserId },
    });
    if (status === "PAID" && ar.salesOrderId) {
      await tx.salesOrder.update({ where: { id: ar.salesOrderId }, data: { status: "PAID" } });
    }
  });
  await audit({ userId: session.user.id, action: "receive", module: "receivables", refId: receivableId, detail: number });

  // 自動建立傳票
  if (paymentId) {
    const draft = await buildReceivePaymentDraft(paymentId);
    await autoCreateJournal(tenantId, draft, session.user.id);
  }
  if (discountId) {
    const draft = await buildDiscountNoteDraft(discountId);
    await autoCreateJournal(tenantId, draft, session.user.id);
  }

  // 返回更新後的應收帳款記錄
  const updated = await prisma.accountsReceivable.findUnique({
    where: { id: receivableId },
    include: { customer: true, salesOrder: true, payments: true },
  });

  return NextResponse.json({ ok: true, paymentId, discountId, number, updated });
});
