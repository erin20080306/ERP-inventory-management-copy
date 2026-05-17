import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, requireTenantId } from "@/lib/api";
import { prisma } from "@/lib/prisma";

// GET /api/accounting/collection-summary
// 收款方式統計：現金 / 票據 / 銀行 分類匯總
export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission("receivables.view");
  const tenantId = await requireTenantId();
  const sp = req.nextUrl.searchParams;
  const type = sp.get("type") ?? "ar"; // ar | ap

  if (type === "ar") {
    // 應收收款統計
    const payments = await prisma.receivePayment.findMany({
      where: { tenantId },
      select: { method: true, amount: true },
    });

    const summary: Record<string, number> = { CASH: 0, BANK: 0, CHECK: 0, OTHER: 0 };
    let total = 0;
    for (const p of payments) {
      const amt = Number(p.amount);
      const key = p.method === "CHEQUE" ? "CHECK" : (p.method in summary ? p.method : "OTHER");
      summary[key] += amt;
      total += amt;
    }

    // 折讓合計
    const discounts = await prisma.discountNote.findMany({
      where: { tenantId, type: "SALES" },
      select: { amount: true },
    });
    const discountTotal = discounts.reduce((s: number, d: any) => s + Number(d.amount), 0);

    return NextResponse.json({
      type: "ar",
      cash: summary.CASH,
      bank: summary.BANK,
      check: summary.CHECK,
      other: summary.OTHER,
      discountTotal,
      total,
      grandTotal: total + discountTotal,
    });
  } else {
    // 應付付款統計
    const payments = await prisma.supplierPayment.findMany({
      where: { tenantId },
      select: { method: true, amount: true },
    });

    const summary: Record<string, number> = { CASH: 0, BANK: 0, CHECK: 0, OTHER: 0 };
    let total = 0;
    for (const p of payments) {
      const amt = Number(p.amount);
      const key = p.method === "CHEQUE" ? "CHECK" : (p.method in summary ? p.method : "OTHER");
      summary[key] += amt;
      total += amt;
    }

    const discounts = await prisma.discountNote.findMany({
      where: { tenantId, type: "PURCHASE" },
      select: { amount: true },
    });
    const discountTotal = discounts.reduce((s: number, d: any) => s + Number(d.amount), 0);

    return NextResponse.json({
      type: "ap",
      cash: summary.CASH,
      bank: summary.BANK,
      check: summary.CHECK,
      other: summary.OTHER,
      discountTotal,
      total,
      grandTotal: total + discountTotal,
    });
  }
});
