import { NextRequest, NextResponse } from "next/server";
import { ApiError, apiHandler, requirePosPermission, requireTenantId } from "@/lib/api";
import { ensureMedicalAestheticsBaseline } from "@/lib/medical-aesthetics";
import { prisma } from "@/lib/prisma";
import { normalizeBusinessMode } from "@/lib/product-editions";

export const GET = apiHandler(async (_req: NextRequest) => {
  const session = await requirePosPermission("view", "sales.view");
  const tenantId = await requireTenantId(session);
  if (!session.user.isSuperAdmin && normalizeBusinessMode(session.user.businessMode) !== "POS_MEDICAL") {
    throw new ApiError(403, "此公司未啟用醫美診所營運管理 POS");
  }
  await ensureMedicalAestheticsBaseline(tenantId);

  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const [services, packages, appointments, customers, purchases, receipts, settings] = await Promise.all([
    prisma.medicalService.findMany({
      where: { tenantId, isActive: true },
      include: {
        product: { select: { id: true, sku: true, name: true, salePrice: true, imageUrl: true } },
        consumables: {
          include: {
            product: {
              select: {
                id: true,
                sku: true,
                name: true,
                costPrice: true,
                stocks: { select: { quantity: true } },
              },
            },
          },
        },
      },
      orderBy: [{ category: "asc" }, { code: "asc" }],
    }),
    prisma.medicalTreatmentPackage.findMany({
      where: { tenantId, isActive: true },
      include: { product: { select: { id: true, salePrice: true, imageUrl: true } }, service: { select: { id: true, code: true } } },
      orderBy: { code: "asc" },
    }),
    prisma.medicalAppointment.findMany({
      where: { tenantId, startAt: { gte: dayStart, lt: dayEnd } },
      include: { customer: { select: { id: true, companyName: true, phone: true } }, service: { include: { product: { select: { name: true, imageUrl: true } } } } },
      orderBy: { startAt: "asc" },
    }),
    prisma.customer.findMany({
      where: { tenantId, isActive: true, code: { not: "POS-WALKIN" } },
      select: {
        id: true,
        code: true,
        companyName: true,
        phone: true,
        email: true,
        medicalWallet: { select: { balance: true } },
      },
      orderBy: { companyName: "asc" },
      take: 100,
    }),
    prisma.medicalPackagePurchase.findMany({
      where: { tenantId, status: "ACTIVE" },
      include: { customer: { select: { companyName: true } }, package: { select: { name: true, serviceId: true } } },
      orderBy: { purchasedAt: "desc" },
      take: 30,
    }),
    prisma.medicalReceipt.findMany({
      where: { tenantId },
      select: { id: true, number: true, patientName: true, total: true, status: true, issuedAt: true },
      orderBy: { issuedAt: "desc" },
      take: 20,
    }),
    prisma.companySetting.findFirst({ where: { tenantId }, select: { name: true, address: true, phone: true, taxId: true, storeSlug: true } }),
  ]);

  return NextResponse.json({
    services: services.map((service) => ({
      ...service,
      product: { ...service.product, salePrice: Number(service.product.salePrice) },
      consumables: service.consumables.map((line) => ({
        id: line.id,
        quantity: Number(line.quantity),
        unit: line.unit,
        product: {
          ...line.product,
          costPrice: Number(line.product.costPrice),
          stockTotal: line.product.stocks.reduce((sum, stock) => sum + Number(stock.quantity), 0),
        },
      })),
    })),
    packages: packages.map((item) => ({ ...item, product: { ...item.product, salePrice: Number(item.product.salePrice) } })),
    appointments,
    customers: customers.map((customer) => ({ ...customer, walletBalance: Number(customer.medicalWallet?.balance ?? 0) })),
    purchases: purchases.map((item) => ({ ...item, paidAmount: Number(item.paidAmount) })),
    receipts: receipts.map((item) => ({ ...item, total: Number(item.total) })),
    settings,
    serverTime: new Date().toISOString(),
  });
});
