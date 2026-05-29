import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, requireTenantId } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { buildExcelWithImages, ServerExcelColumn } from "@/lib/excel-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SalesRow = {
  number: string;
  customerName: string;
  orderDate: string;
  status: string;
  statusText: string;
  productSku: string;
  productName: string;
  productSpec: string | null;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  discount: number;
  taxAmount: number;
  imageUrl: string | null;
};

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission("sales.view");
  const tenantId = await requireTenantId();
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q") ?? "";
  const fromDate = sp.get("from") ?? "";
  const toDate = sp.get("to") ?? "";

  const where: any = q
    ? {
        tenantId,
        OR: [
          { number: { contains: q, mode: "insensitive" } },
          { customer: { companyName: { contains: q, mode: "insensitive" } } },
        ],
      }
    : { tenantId };
  if (fromDate || toDate) {
    where.orderDate = {};
    if (fromDate) where.orderDate.gte = new Date(fromDate);
    if (toDate) {
      const end = new Date(toDate);
      end.setHours(23, 59, 59, 999);
      where.orderDate.lte = end;
    }
  }

  const statusMap: Record<string, string> = {
    DRAFT: "草稿",
    SUBMITTED: "已送出",
    APPROVED: "已核准",
    POSTED: "已過帳",
    VOIDED: "已作廢",
  };

  const orders = await prisma.salesOrder.findMany({
    where,
    include: {
      customer: { select: { companyName: true } },
      items: {
        include: {
          product: {
            select: { sku: true, name: true, spec: true, imageUrl: true },
          },
        },
      },
    },
    orderBy: { orderDate: "desc" },
  });

  const rows: SalesRow[] = [];
  orders.forEach((order: any) => {
    order.items.forEach((item: any) => {
      rows.push({
        number: order.number,
        customerName: order.customer?.companyName ?? "",
        orderDate: order.orderDate,
        status: order.status,
        statusText: statusMap[order.status] || order.status,
        productSku: item.product?.sku ?? "",
        productName: item.product?.name ?? "",
        productSpec: item.product?.spec,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
        subtotal: Number(item.subtotal),
        discount: Number(item.discount || 0),
        taxAmount: Math.round(Number(item.subtotal || 0) * Number(item.taxRate || 0)),
        imageUrl: item.product?.imageUrl,
      });
    });
  });

  const columns: ServerExcelColumn<SalesRow>[] = [
    { header: "圖片", isImage: true, imageUrlGet: (r) => r.imageUrl, width: 14 },
    { header: "單號", get: (r) => r.number, width: 16 },
    { header: "客戶", get: (r) => r.customerName, width: 24 },
    { header: "日期", get: (r) => r.orderDate ? new Date(r.orderDate).toISOString().slice(0, 10) : "", width: 12 },
    { header: "狀態", get: (r) => r.statusText, width: 10 },
    { header: "商品SKU", get: (r) => r.productSku, width: 16 },
    { header: "商品名稱", get: (r) => r.productName, width: 24 },
    { header: "規格", get: (r) => r.productSpec ?? "", width: 16 },
    { header: "數量", get: (r) => r.quantity, width: 10 },
    { header: "單價", get: (r) => r.unitPrice, width: 12 },
    { header: "小計", get: (r) => r.subtotal, width: 12 },
    { header: "折扣", get: (r) => r.discount, width: 10 },
    { header: "稅金", get: (r) => r.taxAmount, width: 10 },
  ];

  const buffer = await buildExcelWithImages("銷售管理", rows, columns);
  const filename = `銷售單-${new Date().toISOString().slice(0, 10)}.xlsx`;

  return new NextResponse(buffer as any, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
});
