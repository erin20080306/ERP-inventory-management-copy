import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, requireTenantId } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { buildExcelWithImages, ServerExcelColumn } from "@/lib/excel-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PurchaseRow = {
  number: string;
  supplierName: string;
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
  await requirePermission("purchases.view");
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
          { supplier: { companyName: { contains: q, mode: "insensitive" } } },
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
    PARTIALLY_RECEIVED: "部分進貨",
    POSTED: "已過帳",
    VOIDED: "已作廢",
  };

  const orders = await prisma.purchaseOrder.findMany({
    where,
    include: {
      supplier: { select: { companyName: true } },
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

  const rows: PurchaseRow[] = [];
  orders.forEach((order: any) => {
    order.items.forEach((item: any) => {
      rows.push({
        number: order.number,
        supplierName: order.supplier?.companyName ?? "",
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

  const columns: ServerExcelColumn<PurchaseRow>[] = [
    { header: "圖片", isImage: true, imageUrlGet: (r) => r.imageUrl, width: 14 },
    { header: "單號", get: (r) => r.number, width: 16 },
    { header: "供應商", get: (r) => r.supplierName, width: 24 },
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

  const buffer = await buildExcelWithImages("採購管理", rows, columns);
  const filename = `採購單-${new Date().toISOString().slice(0, 10)}.xlsx`;

  return new NextResponse(buffer as any, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
});
