import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, requireTenantId, audit, getCurrentUserId } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { calculateInvoiceTotals } from "@/lib/invoice-totals";

export const PUT = apiHandler(async (req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requirePermission("invoices.edit");
  const tenantId = await requireTenantId();
  const currentUserId = await getCurrentUserId();
  const body = await req.json();
  const existing = await prisma.invoice.findUnique({
    where: { id: params.id, tenantId },
    include: { items: true },
  });
  if (!existing) throw new Error("發票不存在");

  const type = body.type ?? existing.type;
  if (!["SALES", "PURCHASE"].includes(type)) throw new Error("請指定發票類型 (銷項/進項)");

  const sourceItems = Array.isArray(body.items) && body.items.length ? body.items : existing.items;
  if (!sourceItems.length) throw new Error("請至少新增一項明細");

  const customerId = type === "SALES" ? body.customerId || body.customer?.id || existing.customerId : null;
  const supplierId = type === "PURCHASE" ? body.supplierId || body.supplier?.id || existing.supplierId : null;
  if (type === "SALES" && !customerId) throw new Error("銷項發票必須選擇客戶");
  if (type === "PURCHASE" && !supplierId) throw new Error("進項發票必須選擇供應商");

  const totals = calculateInvoiceTotals(sourceItems);
  const updated = await prisma.$transaction(async (tx) => {
    await tx.invoiceItem.deleteMany({ where: { invoiceId: existing.id } });
    return tx.invoice.update({
      where: { id: existing.id },
      data: {
        number: body.number ?? existing.number,
        type,
        invoiceDate: body.invoiceDate ? new Date(body.invoiceDate) : existing.invoiceDate,
        customerId,
        supplierId,
        amountExTax: totals.amountExTax,
        taxAmount: totals.taxAmount,
        totalAmount: totals.totalAmount,
        remark: body.remark ?? null,
        updatedBy: currentUserId,
        items: { create: totals.computed },
      },
      include: { items: true, customer: true, supplier: true },
    });
  });

  await audit({
    userId: session.user.id,
    action: "update",
    module: "invoices",
    refId: existing.id,
    detail: updated.number,
  });

  return NextResponse.json(updated);
});

export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requirePermission("invoices.edit");
  const tenantId = await requireTenantId();
  const currentUserId = await getCurrentUserId();
  const { action } = await req.json();
  
  if (action === "submit") {
    await requirePermission("invoices.submit");
    await prisma.invoice.update({ where: { id: params.id, tenantId }, data: { status: "SUBMITTED", updatedBy: currentUserId } });
  } else if (action === "approve") {
    await requirePermission("invoices.approve");
    await prisma.invoice.update({ where: { id: params.id, tenantId }, data: { status: "APPROVED", updatedBy: currentUserId } });
  } else if (action === "reject") {
    await requirePermission("invoices.reject");
    await prisma.invoice.update({ where: { id: params.id, tenantId }, data: { status: "REJECTED", updatedBy: currentUserId } });
  } else if (action === "post") {
    await requirePermission("invoices.post");
    await prisma.invoice.update({ where: { id: params.id, tenantId }, data: { status: "POSTED", updatedBy: currentUserId } });
  } else if (action === "void") {
    await requirePermission("invoices.void");
    await prisma.invoice.update({ where: { id: params.id, tenantId }, data: { status: "VOIDED", updatedBy: currentUserId } });
  }
  
  await audit({ userId: session.user.id, action, module: "invoices", refId: params.id });
  return NextResponse.json({ ok: true });
});

export const DELETE = apiHandler(async (_req: NextRequest, { params }: { params: { id: string } }) => {
  const session = await requirePermission("invoices.delete");
  const tenantId = await requireTenantId();
  await prisma.invoice.delete({ where: { id: params.id, tenantId } });
  await audit({ userId: session.user.id, action: "delete", module: "invoices", refId: params.id });
  return NextResponse.json({ ok: true });
});
