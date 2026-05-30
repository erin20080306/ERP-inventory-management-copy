import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, requireTenantId, audit, nextNumber } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { buildInventoryAdjustmentDraft, autoCreateJournal } from "@/lib/auto-journal";

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission("inventory.view");
  const tenantId = await requireTenantId();
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q") ?? "";
  const page = Number(sp.get("page") ?? 1);
  const pageSize = Math.min(Number(sp.get("pageSize") ?? 20), 200);
  const fromDate = sp.get("from") ?? "";
  const toDate = sp.get("to") ?? "";
  const where: any = q
    ? { tenantId, OR: [{ number: { contains: q, mode: "insensitive" } }] }
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
  const [adjustments, total] = await Promise.all([
    prisma.stockAdjustment.findMany({
      where,
      include: { warehouse: true, items: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.stockAdjustment.count({ where }),
  ]);

  // 手動取得商品資料
  const productIds = adjustments.flatMap(a => a.items.map(i => i.productId));
  const products = productIds.length > 0 ? await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, name: true, sku: true, costPrice: true },
  }) : [];
  const productMap = Object.fromEntries(products.map(p => [p.id, p]));

  const items = adjustments.map(adj => ({
    ...adj,
    items: adj.items.map(item => ({
      ...item,
      product: productMap[item.productId] || null,
    })),
  }));
  return NextResponse.json({ items, total });
});

export const POST = apiHandler(async (req: NextRequest) => {
  const session = await requirePermission("inventory.edit");
  const tenantId = await requireTenantId();
  const body = await req.json();
  const { warehouseId, reason, status, items } = body as any;
  if (!warehouseId) throw new Error("請選擇倉庫");
  if (!items?.length) throw new Error("請至少新增一項商品");
  
  const number = await nextNumber("IA", tenantId);
  const isConfirmed = (status ?? "DRAFT") === "APPROVED";

  // 計算差異總金額（用於傳票）
  const totalGain = items.reduce((s: number, i: any) => s + (Number(i.diff) > 0 ? Number(i.diff) * Number(i.unitCost || 0) : 0), 0);
  const totalLoss = items.reduce((s: number, i: any) => s + (Number(i.diff) < 0 ? Math.abs(Number(i.diff)) * Number(i.unitCost || 0) : 0), 0);

  const created = await prisma.$transaction(async (tx) => {
    const adj = await tx.stockAdjustment.create({
      data: {
        tenantId,
        number,
        warehouseId,
        reason,
        status: status ?? "DRAFT",
        items: {
          create: items.map((i: any) => ({
            productId: i.productId,
            systemQty: Number(i.systemQty),
            actualQty: Number(i.actualQty),
            diff: Number(i.diff),
            remark: i.remark,
          })),
        },
      },
      include: { items: true, warehouse: true },
    });

    // 手動取得商品資料
    const productIds = adj.items.map(i => i.productId);
    const products = await tx.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true, costPrice: true },
    });
    const productMap = Object.fromEntries(products.map(p => [p.id, p]));
    const adjWithProducts = {
      ...adj,
      items: adj.items.map(i => ({ ...i, product: productMap[i.productId] || null })),
    };

    if (isConfirmed) {
      // 更新庫存數量
      for (const item of adj.items) {
        const stock = await tx.inventoryStock.findUnique({
          where: { productId_warehouseId: { productId: item.productId, warehouseId } },
        });
        if (stock) {
          await tx.inventoryStock.update({
            where: { productId_warehouseId: { productId: item.productId, warehouseId } },
            data: { quantity: { increment: Number(item.diff) } },
          });
        } else {
          await tx.inventoryStock.create({
            data: {
              tenantId,
              productId: item.productId,
              warehouseId,
              quantity: Number(item.diff),
            },
          });
        }

        // 記錄庫存交易
        const product = productMap[item.productId];
        const unitCost = Number(product?.costPrice || 0);
        await tx.inventoryTransaction.create({
          data: {
            tenantId,
            productId: item.productId,
            warehouseId,
            type: Number(item.diff) > 0 ? "ADJUST_IN" : "ADJUST_OUT",
            quantity: Number(item.diff),
            unitCost,
            refType: "ADJUSTMENT",
            refId: adj.id,
            remark: `盤點調整 ${adj.number}`,
          },
        });
      }
    }

    return adjWithProducts;
  });

  // 非同步處理：audit + 自動傳票
  const bgTasks: Promise<any>[] = [
    audit({ userId: session.user.id, action: "create", module: "inventory", refId: created.id, detail: number }),
  ];
  if (isConfirmed) {
    bgTasks.push(
      (async () => {
        const draft = await buildInventoryAdjustmentDraft(created.id);
        if (draft) await autoCreateJournal(tenantId, draft, session.user.id);
      })()
    );
  }
  await Promise.all(bgTasks);

  return NextResponse.json({ ...created, autoCreated: isConfirmed });
});
