import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, requireTenantId, audit, nextNumber, getCurrentUserId } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { calcTotals } from "@/lib/documents";

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission("returns.view");
  const tenantId = await requireTenantId();
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q") ?? "";
  const page = Number(sp.get("page") ?? 1);
  const pageSize = Number(sp.get("pageSize") ?? 20);
  const fromDate = sp.get("from") ?? "";
  const toDate = sp.get("to") ?? "";
  const where: any = q
    ? { tenantId, OR: [{ number: { contains: q, mode: "insensitive" } }, { supplier: { companyName: { contains: q, mode: "insensitive" } } }] }
    : { tenantId };
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
    prisma.purchaseReturn.findMany({
      where,
      include: { supplier: true, items: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.purchaseReturn.count({ where }),
  ]);
  return NextResponse.json({ items, total });
});

export const POST = apiHandler(async (req: NextRequest) => {
  const session = await requirePermission("returns.edit");
  const tenantId = await requireTenantId();
  const currentUserId = await getCurrentUserId();
  const body = await req.json();
  const { supplierId, purchaseOrderId, reason, status, items } = body as any;
  if (!supplierId) throw new Error("請選擇供應商");
  if (!items?.length) throw new Error("請至少新增一項商品");
  const totals = calcTotals(items);
  const number = await nextNumber("PR", tenantId);

  const created = await prisma.$transaction(async (tx) => {
    const ret = await tx.purchaseReturn.create({
      data: {
        tenantId,
        number,
        supplierId,
        purchaseOrderId,
        reason,
        status: status ?? "DRAFT",
        returnDate: new Date(),
        total: totals.total,
        updatedBy: currentUserId,
        items: {
          create: totals.computed.map((i: any) => ({
            productId: i.productId,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            discount: i.discount ?? 0,
            taxRate: i.taxRate ?? 0,
            subtotal: i.subtotal,
          })),
        },
      },
      include: { items: true, supplier: true },
    });

    // 如果確認，更新庫存和應付帳款
    if ((status ?? "DRAFT") === "APPROVED") {
      for (const item of ret.items) {
        // 更新庫存（退貨出庫）
        const stock = await tx.inventoryStock.findFirst({
          where: { productId: item.productId },
        });
        if (stock) {
          await tx.inventoryStock.update({
            where: { id: stock.id },
            data: { quantity: { decrement: Number(item.quantity) } },
          });
        }
        
        // 記錄庫存交易
        await tx.inventoryTransaction.create({
          data: {
            tenantId,
            productId: item.productId,
            warehouseId: stock?.warehouseId || "",
            type: "PURCHASE_RETURN_OUT",
            quantity: -Number(item.quantity),
            refType: "PURCHASE_RETURN",
            refId: ret.id,
            remark: `採購退回 ${ret.number}`,
          },
        });
      }

      // 沖銷應付帳款
      await tx.accountsPayable.create({
        data: {
          tenantId,
          supplierId,
          purchaseOrderId: ret.id,
          amount: -totals.total,
          status: "DRAFT",
        },
      });
    }

    return ret;
  });

  await audit({ userId: session.user.id, action: "create", module: "returns", refId: created.id, detail: number });

  return NextResponse.json(created);
});

export const PATCH = apiHandler(async (req: NextRequest) => {
  const session = await requirePermission("returns.edit");
  const tenantId = await requireTenantId();
  const currentUserId = await getCurrentUserId();
  const body = await req.json();
  const { id, action } = body as any;

  if (action === "submit") {
    await requirePermission("returns.submit");
    await prisma.purchaseReturn.update({ where: { id, tenantId }, data: { status: "SUBMITTED", updatedBy: currentUserId } });
  } else if (action === "approve") {
    await requirePermission("returns.approve");
    await prisma.purchaseReturn.update({ where: { id, tenantId }, data: { status: "APPROVED", updatedBy: currentUserId } });
  } else if (action === "reject") {
    await requirePermission("returns.reject");
    await prisma.purchaseReturn.update({ where: { id, tenantId }, data: { status: "REJECTED", updatedBy: currentUserId } });
  } else if (action === "post") {
    await requirePermission("returns.post");
    await prisma.purchaseReturn.update({ where: { id, tenantId }, data: { status: "POSTED", updatedBy: currentUserId } });
  } else if (action === "void") {
    await requirePermission("returns.void");
    await prisma.purchaseReturn.update({ where: { id, tenantId }, data: { status: "VOIDED", updatedBy: currentUserId } });
  }

  await audit({ userId: session.user.id, action, module: "returns", refId: id });
  return NextResponse.json({ ok: true });
});

export const PUT = apiHandler(async (req: NextRequest) => {
  const session = await requirePermission("returns.edit");
  const tenantId = await requireTenantId();
  const currentUserId = await getCurrentUserId();
  const body = await req.json();
  const { id, supplierId, purchaseOrderId, reason, status, items } = body as any;
  if (!supplierId) throw new Error("請選擇供應商");
  if (!items?.length) throw new Error("請至少新增一項商品");
  const totals = calcTotals(items);

  const existing = await prisma.purchaseReturn.findUnique({ where: { id, tenantId } });
  if (!existing) throw new Error("退貨單不存在");

  const updated = await prisma.purchaseReturn.update({
    where: { id, tenantId },
    data: {
      supplierId,
      purchaseOrderId,
      reason,
      status: status ?? existing.status,
      total: totals.total,
      updatedBy: currentUserId,
      items: {
        deleteMany: {},
        create: totals.computed.map((i: any) => ({
          productId: i.productId,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          discount: i.discount ?? 0,
          taxRate: i.taxRate ?? 0,
          subtotal: i.subtotal,
        })),
      },
    },
    include: { items: true, supplier: true },
  });

  await audit({ userId: session.user.id, action: "update", module: "returns", refId: id, detail: existing.number });

  return NextResponse.json(updated);
});
