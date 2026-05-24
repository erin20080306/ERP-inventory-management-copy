import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, requireTenantId, audit, nextNumber, getCurrentUserId } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { buildSupplierPaymentDraft, buildDiscountNoteDraft, autoCreateJournal } from "@/lib/auto-journal";

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission("payables.view");
  const tenantId = await requireTenantId();
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q") ?? "";
  const supplierId = sp.get("supplierId") ?? "";
  const statusFilter = sp.get("status") ?? "";
  const page = Number(sp.get("page") ?? 1);
  const pageSize = Number(sp.get("pageSize") ?? 20);
  const fromDate = sp.get("from") ?? "";
  const toDate = sp.get("to") ?? "";
  const where: any = { tenantId };
  if (q) where.supplier = { companyName: { contains: q, mode: "insensitive" } };
  if (supplierId) where.supplierId = supplierId;
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
    prisma.accountsPayable.findMany({
      where,
      include: { supplier: true, purchaseOrder: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.accountsPayable.count({ where }),
  ]);
  return NextResponse.json({ items, total });
});

// 付款（含折讓）
export const POST = apiHandler(async (req: NextRequest) => {
  const session = await requirePermission("payables.edit");
  const tenantId = await requireTenantId();
  const currentUserId = await getCurrentUserId();
  const body = await req.json();
  const { payableId, amount, discount, discountNote, method, remark } = body;
  const ap = await prisma.accountsPayable.findUnique({
    where: { id: payableId },
    include: { purchaseOrder: true },
  });
  if (!ap || ap.tenantId !== tenantId) throw new Error("找不到應付帳款");
  const totalWriteOff = Number(amount || 0) + Number(discount || 0);
  const balance = Number(ap.amount) - Number(ap.paidAmount);
  if (totalWriteOff > balance) throw new Error("沖帳金額不可大於未結款項");

  const number = await nextNumber("SP", tenantId);
  let paymentId: string | null = null;
  let discountId: string | null = null;

  await prisma.$transaction(async (tx: any) => {
    // 建立付款紀錄
    if (Number(amount) > 0) {
      const created = await tx.supplierPayment.create({
        data: { tenantId, number, supplierId: ap.supplierId, payableId: ap.id, amount: Number(amount), method, remark, updatedBy: currentUserId },
      });
      paymentId = created.id;
    }
    // 建立折讓單
    if (Number(discount) > 0) {
      const dnNumber = await nextNumber("DN", tenantId);
      const dn = await tx.discountNote.create({
        data: {
          tenantId, number: dnNumber, type: "PURCHASE",
          supplierId: ap.supplierId, payableId: ap.id,
          amount: Number(discount), reason: discountNote || null,
          relNumber: ap.purchaseOrder?.number || null,
        },
      });
      discountId = dn.id;
    }
    // 更新應付帳款
    const newPaid = Number(ap.paidAmount) + totalWriteOff;
    const status = newPaid >= Number(ap.amount) ? "PAID" : "PARTIAL";
    await tx.accountsPayable.update({ where: { id: ap.id }, data: { paidAmount: newPaid, status, updatedBy: currentUserId } });
  });
  await audit({ userId: session.user.id, action: "pay", module: "payables", refId: payableId, detail: number });

  // 自動建立傳票
  if (paymentId) {
    const draft = await buildSupplierPaymentDraft(paymentId);
    await autoCreateJournal(tenantId, draft, session.user.id);
  }
  if (discountId) {
    const draft = await buildDiscountNoteDraft(discountId);
    await autoCreateJournal(tenantId, draft, session.user.id);
  }

  // 返回更新後的應付帳款記錄
  const updated = await prisma.accountsPayable.findUnique({
    where: { id: payableId },
    include: { supplier: true, purchaseOrder: true, payments: true },
  });

  return NextResponse.json({ ok: true, paymentId, discountId, number, updated });
});
