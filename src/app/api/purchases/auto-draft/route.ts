import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, requireTenantId, audit, nextNumber, getCurrentUserName } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { calcTotals } from "@/lib/documents";
import { computeReorderSuggestions, groupSuggestionsBySupplier } from "@/lib/reorder-forecast";

// 智慧補貨：依補貨建議「一鍵生成採購草稿」。每個供應商各開一張 DRAFT 採購單，
// 使用者在採購列表確認後再送審，避免自動送出造成誤採。
//
// 請求 body（皆可選）：
//   orders:       [{ supplierId, remark?, items:[{ productId, quantity, unitPrice? }] }]
//                 由前端預覽並調整後的最終內容，優先採用。
//   supplierIds:  未提供 orders 時，只針對這些供應商重新計算並開單（省略＝全部）。
//   windowDays / reviewDays: 重新計算時的參數。
export const dynamic = "force-dynamic";

type DraftItemInput = { productId: string; quantity: number; unitPrice?: number };
type DraftOrderInput = { supplierId: string; remark?: string; items: DraftItemInput[] };

export const POST = apiHandler(async (req: NextRequest) => {
  const session = await requirePermission("purchases.create");
  const tenantId = await requireTenantId(session);
  const currentUserId = await getCurrentUserName();
  const body = (await req.json().catch(() => ({}))) as {
    orders?: DraftOrderInput[];
    supplierIds?: string[];
    windowDays?: number;
    reviewDays?: number;
  };

  // 決定要開單的內容：優先用前端傳來的 orders，否則重新計算補貨建議
  let orders: DraftOrderInput[];
  if (body.orders?.length) {
    orders = body.orders;
  } else {
    const suggestions = await computeReorderSuggestions(tenantId, {
      demandWindowDays: body.windowDays,
      reviewDays: body.reviewDays,
      onlyActionable: true,
    });
    let groups = groupSuggestionsBySupplier(suggestions);
    if (body.supplierIds?.length) {
      const allow = new Set(body.supplierIds);
      groups = groups.filter((g) => allow.has(g.supplierId));
    }
    orders = groups.map((g) => ({
      supplierId: g.supplierId,
      items: g.items.map((it) => ({ productId: it.productId, quantity: it.suggestedQty, unitPrice: it.costPrice })),
    }));
  }

  if (!orders.length) {
    return NextResponse.json({ created: [], message: "目前沒有需要補貨的品項" });
  }

  // 驗證供應商與商品皆屬於本租戶，避免跨租戶注入
  const supplierIds = Array.from(new Set(orders.map((o) => o.supplierId)));
  const productIds = Array.from(new Set(orders.flatMap((o) => o.items.map((i) => i.productId))));
  const [validSuppliers, validProducts] = await Promise.all([
    prisma.supplier.findMany({ where: { tenantId, id: { in: supplierIds } }, select: { id: true } }),
    prisma.product.findMany({ where: { tenantId, id: { in: productIds } }, select: { id: true, costPrice: true } }),
  ]);
  const validSupplierIds = new Set(validSuppliers.map((s) => s.id));
  const costById = new Map(validProducts.map((p) => [p.id, Number(p.costPrice)]));

  const created: Array<{ id: string; number: string; supplierId: string; itemCount: number; total: number }> = [];
  const skipped: Array<{ supplierId: string; reason: string }> = [];

  for (const order of orders) {
    if (!validSupplierIds.has(order.supplierId)) {
      skipped.push({ supplierId: order.supplierId, reason: "供應商不存在或不屬於此租戶" });
      continue;
    }
    const items = (order.items ?? [])
      .filter((i) => costById.has(i.productId) && Number(i.quantity) > 0)
      .map((i) => ({
        productId: i.productId,
        quantity: Number(i.quantity),
        unitPrice: i.unitPrice != null && Number(i.unitPrice) >= 0 ? Number(i.unitPrice) : costById.get(i.productId) ?? 0,
      }));
    if (!items.length) {
      skipped.push({ supplierId: order.supplierId, reason: "無有效品項" });
      continue;
    }

    const totals = calcTotals(items, true);
    const number = await nextNumber("PO", tenantId);
    const po = await prisma.purchaseOrder.create({
      data: {
        tenantId,
        number,
        supplierId: order.supplierId,
        status: "DRAFT",
        remark: order.remark ?? "由智慧補貨自動產生，請確認後送審",
        subtotal: totals.subtotal,
        discount: totals.discount,
        taxAmount: totals.taxAmount,
        total: totals.total,
        isTaxable: true,
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
      select: { id: true, number: true, supplierId: true, total: true, _count: { select: { items: true } } },
    });
    created.push({ id: po.id, number: po.number, supplierId: po.supplierId, itemCount: po._count.items, total: Number(po.total) });
    await audit({ userId: session.user.id, action: "create", module: "purchases", refId: po.id, detail: `${number}（智慧補貨草稿）` });
  }

  return NextResponse.json({
    created,
    skipped,
    createdCount: created.length,
    message: created.length ? `已建立 ${created.length} 張採購草稿` : "未建立任何草稿",
  });
});
