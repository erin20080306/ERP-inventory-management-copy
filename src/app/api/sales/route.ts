import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, requireTenantId, audit, nextNumber } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { calcTotals } from "@/lib/documents";
import { buildARCreatedDraft, autoCreateJournal } from "@/lib/auto-journal";

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission("sales.view");
  const tenantId = await requireTenantId();
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q") ?? "";
  const page = Number(sp.get("page") ?? 1);
  const pageSize = Number(sp.get("pageSize") ?? 20);
  const where: any = q
    ? { tenantId, OR: [{ number: { contains: q, mode: "insensitive" } }, { customer: { companyName: { contains: q, mode: "insensitive" } } }] }
    : { tenantId };
  const [items, total] = await Promise.all([
    prisma.salesOrder.findMany({
      where,
      include: { customer: true, items: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.salesOrder.count({ where }),
  ]);
  return NextResponse.json({ items, total });
});

export const POST = apiHandler(async (req: NextRequest) => {
  const session = await requirePermission("sales.create");
  const tenantId = await requireTenantId();
  const body = await req.json();
  const { customerId, items, remark, status } = body as any;
  if (!customerId) throw new Error("請選擇客戶");
  if (!items?.length) throw new Error("請至少新增一項商品");
  const totals = calcTotals(items);
  const number = await nextNumber("SO", tenantId);
  const created = await prisma.salesOrder.create({
    data: {
      tenantId,
      number,
      customerId,
      remark,
      status: status ?? "DRAFT",
      subtotal: totals.subtotal,
      discount: totals.discount,
      taxAmount: totals.taxAmount,
      total: totals.total,
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
    include: { items: true, customer: true },
  });
  await audit({ userId: session.user.id, action: "create", module: "sales", refId: created.id, detail: number });

  // 如果建立時直接是 CONFIRMED，自動建立應收帳款 + 傳票
  if ((status ?? "DRAFT") === "CONFIRMED") {
    await prisma.accountsReceivable.create({
      data: {
        tenantId,
        customerId,
        salesOrderId: created.id,
        amount: totals.total,
        status: "OPEN",
      },
    });
    const draft = await buildARCreatedDraft(created.id);
    await autoCreateJournal(tenantId, draft, session.user.id);
  }

  return NextResponse.json(created);
});
