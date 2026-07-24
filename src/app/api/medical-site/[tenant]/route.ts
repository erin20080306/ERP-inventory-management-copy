import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { nextNumberFastInTransaction } from "@/lib/number-sequence";
import { ensureMedicalAestheticsBaseline, MEDICAL_DEMO_SERVICES } from "@/lib/medical-aesthetics";
import { prisma } from "@/lib/prisma";
import { normalizeStoreSlug } from "@/lib/storefront-branding";

const BookingInput = z.object({
  serviceId: z.string().min(1),
  name: z.string().trim().min(1).max(100),
  phone: z.string().trim().min(6).max(30),
  email: z.string().trim().email().optional().nullable(),
  startAt: z.string().datetime(),
  notes: z.string().trim().max(500).optional().nullable(),
});

async function findMedicalTenant(rawKey: string) {
  const key = decodeURIComponent(rawKey).trim();
  return prisma.tenant.findFirst({
    where: {
      isInternal: false,
      businessMode: "POS_MEDICAL",
      OR: [
        { id: key },
        { companyCode: key.toUpperCase() },
        { companySettings: { some: { storeSlug: normalizeStoreSlug(key) } } },
      ],
    },
    select: {
      id: true,
      name: true,
      companySettings: {
        select: { name: true, storeName: true, storeSlug: true, address: true, phone: true, email: true },
        take: 1,
      },
    },
  });
}

export const GET = async (_req: NextRequest, { params }: { params: Promise<{ tenant: string }> }) => {
  const { tenant } = await params;
  const identity = await findMedicalTenant(tenant);
  if (!identity && tenant.toLowerCase() === "atelier-clinic") {
    return NextResponse.json({
      demo: true,
      clinic: { name: "ATELIER CLINIC 艾緹雅醫美", address: "台北市信義區示範路 88 號", phone: "02-2345-6789" },
      services: MEDICAL_DEMO_SERVICES.map((item, index) => ({
        id: `demo-${index + 1}`,
        code: item.code,
        category: item.category,
        durationMinutes: item.durationMinutes,
        consentRequired: item.consentRequired,
        product: { name: item.name, salePrice: item.price, imageUrl: item.imageUrl },
      })),
    });
  }
  if (!identity) return NextResponse.json({ error: "找不到醫美診所官網" }, { status: 404 });
  await ensureMedicalAestheticsBaseline(identity.id);
  const services = await prisma.medicalService.findMany({
    where: { tenantId: identity.id, isActive: true, product: { isPublished: true, isActive: true } },
    include: { product: { select: { name: true, salePrice: true, imageUrl: true } } },
    orderBy: [{ category: "asc" }, { code: "asc" }],
  });
  return NextResponse.json({
    demo: false,
    clinic: {
      name: identity.companySettings[0]?.storeName || identity.companySettings[0]?.name || identity.name,
      address: identity.companySettings[0]?.address,
      phone: identity.companySettings[0]?.phone,
      email: identity.companySettings[0]?.email,
    },
    services: services.map((service) => ({ ...service, product: { ...service.product, salePrice: Number(service.product.salePrice) } })),
  });
};

export const POST = async (req: NextRequest, { params }: { params: Promise<{ tenant: string }> }) => {
  try {
    const { tenant } = await params;
    const identity = await findMedicalTenant(tenant);
    if (!identity) {
      return NextResponse.json({ error: tenant.toLowerCase() === "atelier-clinic" ? "示範官網不會寫入預約，請註冊醫美租戶體驗" : "找不到醫美診所官網" }, { status: tenant.toLowerCase() === "atelier-clinic" ? 400 : 404 });
    }
    const body = BookingInput.parse(await req.json());
    const startAt = new Date(body.startAt);
    if (startAt.getTime() < Date.now() + 30 * 60_000) return NextResponse.json({ error: "請選擇至少 30 分鐘後的時間" }, { status: 400 });
    const result = await prisma.$transaction(async (tx) => {
      const service = await tx.medicalService.findFirst({
        where: { id: body.serviceId, tenantId: identity.id, isActive: true },
        select: { id: true, durationMinutes: true },
      });
      if (!service) throw new Error("找不到服務");
      let customer = await tx.customer.findFirst({ where: { tenantId: identity.id, phone: body.phone, isActive: true } });
      if (!customer) {
        customer = await tx.customer.create({
          data: {
            tenantId: identity.id,
            code: await nextNumberFastInTransaction(tx, "MC", identity.id),
            companyName: body.name,
            phone: body.phone,
            email: body.email || null,
          },
        });
      }
      const endAt = new Date(startAt.getTime() + service.durationMinutes * 60_000);
      const appointment = await tx.medicalAppointment.create({
        data: {
          tenantId: identity.id,
          customerId: customer.id,
          serviceId: service.id,
          number: await nextNumberFastInTransaction(tx, "MA", identity.id),
          startAt,
          endAt,
          practitionerName: "待診所指派",
          notes: body.notes || "由診所官網預約",
          createdById: customer.id,
        },
      });
      return appointment;
    });
    return NextResponse.json({ ok: true, number: result.number, startAt: result.startAt });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "預約資料格式不正確" }, { status: 400 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "預約失敗" }, { status: 400 });
  }
};
