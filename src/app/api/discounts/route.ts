import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, requireTenantId, audit, nextNumber } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission("accounting.view");
  const tenantId = await requireTenantId();
  const sp = req.nextUrl.searchParams;
  const type = sp.get("type") ?? "";
  const q = sp.get("q") ?? "";
  const page = Number(sp.get("page") ?? 1);
  const pageSize = Number(sp.get("pageSize") ?? 20);
  const fromDate = sp.get("from") ?? "";
  const toDate = sp.get("to") ?? "";
  
  const where: any = { tenantId };
  if (type) where.type = type;
  if (q) {
    where.OR = [
      { number: { contains: q, mode: "insensitive" } },
      { relNumber: { contains: q, mode: "insensitive" } },
    ];
  }
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
    prisma.discountNote.findMany({
      where,
      include: { customer: true, supplier: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.discountNote.count({ where }),
  ]);
  return NextResponse.json({ items, total });
});

export const POST = apiHandler(async (req: NextRequest) => {
  const session = await requirePermission("accounting.edit");
  const tenantId = await requireTenantId();
  const body = await req.json();
  const { type, customerId, supplierId, amount, reason, relNumber } = body as any;
  
  if (!type || (type !== "SALES" && type !== "PURCHASE")) throw new Error("請選擇折讓類型");
  if (type === "SALES" && !customerId) throw new Error("請選擇客戶");
  if (type === "PURCHASE" && !supplierId) throw new Error("請選擇供應商");
  if (!amount || Number(amount) <= 0) throw new Error("請輸入折讓金額");
  
  const number = await nextNumber("DN", tenantId);
  
  const created = await prisma.$transaction(async (tx) => {
    const note = await tx.discountNote.create({
      data: {
        tenantId,
        number,
        type,
        customerId,
        supplierId,
        amount,
        reason,
        relNumber,
      },
      include: { customer: true, supplier: true },
    });
    
    // 建立對應的應收/應付調整
    if (type === "SALES") {
      await tx.accountsReceivable.create({
        data: {
          tenantId,
          customerId,
          amount: -Number(amount),
          status: "DRAFT",
        },
      });
    } else {
      await tx.accountsPayable.create({
        data: {
          tenantId,
          supplierId,
          amount: -Number(amount),
          status: "DRAFT",
        },
      });
    }
    
    return note;
  });
  
  await audit({ userId: session.user.id, action: "create", module: "accounting", refId: created.id, detail: `折讓單 ${number} ${type === "SALES" ? "銷售" : "進貨"}` });
  
  return NextResponse.json(created);
});
