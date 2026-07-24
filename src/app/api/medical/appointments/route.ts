import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { ApiError, apiHandler, audit, requirePosPermission, requireTenantId } from "@/lib/api";
import { nextNumberFastInTransaction, nextNumbersFastInTransaction } from "@/lib/number-sequence";
import { createCheckoutJournal } from "@/lib/pos-fulfillment";
import { prisma } from "@/lib/prisma";

const AppointmentInput = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("CREATE"),
    customerId: z.string().min(1),
    serviceId: z.string().min(1),
    startAt: z.string().datetime(),
    practitionerName: z.string().trim().min(1).max(100),
    room: z.string().trim().max(50).optional().nullable(),
    notes: z.string().trim().max(1000).optional().nullable(),
  }),
  z.object({
    action: z.literal("STATUS"),
    appointmentId: z.string().min(1),
    status: z.enum(["BOOKED", "CHECKED_IN", "PAID", "IN_SERVICE", "CANCELLED"]),
  }),
  z.object({
    action: z.literal("CONSENT"),
    appointmentId: z.string().min(1),
    signedName: z.string().trim().min(1).max(100),
    responses: z.record(z.string(), z.unknown()).optional(),
  }),
  z.object({
    action: z.literal("COMPLETE"),
    appointmentId: z.string().min(1),
    packagePurchaseId: z.string().min(1).optional().nullable(),
    treatmentNotes: z.string().trim().max(3000).optional().nullable(),
    beforePhotoUrl: z.string().trim().max(500).optional().nullable(),
    afterPhotoUrl: z.string().trim().max(500).optional().nullable(),
  }),
]);

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export const GET = apiHandler(async (req: NextRequest) => {
  const session = await requirePosPermission("view", "sales.view");
  const tenantId = await requireTenantId(session);
  const date = req.nextUrl.searchParams.get("date");
  const start = date ? new Date(`${date}T00:00:00`) : new Date();
  if (Number.isNaN(start.getTime())) throw new ApiError(400, "日期格式不正確");
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const appointments = await prisma.medicalAppointment.findMany({
    where: { tenantId, startAt: { gte: start, lt: end } },
    include: {
      customer: { select: { id: true, companyName: true, phone: true } },
      service: { include: { product: { select: { name: true, imageUrl: true, salePrice: true } } } },
      consents: { orderBy: { createdAt: "desc" }, take: 1 },
      treatmentRecord: true,
      posSale: { select: { id: true, number: true, total: true } },
    },
    orderBy: { startAt: "asc" },
  });
  return NextResponse.json({ appointments });
});

export const POST = apiHandler(async (req: NextRequest) => {
  const session = await requirePosPermission("update", "sales.update");
  const tenantId = await requireTenantId(session);
  const body = AppointmentInput.parse(await req.json());

  if (body.action === "CREATE") {
    const result = await prisma.$transaction(async (tx) => {
      const service = await tx.medicalService.findFirst({
        where: { id: body.serviceId, tenantId, isActive: true },
        select: { id: true, durationMinutes: true },
      });
      const customer = await tx.customer.findFirst({ where: { id: body.customerId, tenantId, isActive: true }, select: { id: true } });
      if (!service || !customer) throw new ApiError(400, "找不到客戶或服務");
      const startAt = new Date(body.startAt);
      const endAt = new Date(startAt.getTime() + service.durationMinutes * 60_000);
      const conflict = await tx.medicalAppointment.findFirst({
        where: {
          tenantId,
          practitionerName: body.practitionerName,
          status: { notIn: ["CANCELLED", "COMPLETED"] },
          startAt: { lt: endAt },
          endAt: { gt: startAt },
        },
        select: { number: true },
      });
      if (conflict) throw new ApiError(409, `該人員時段已有預約 ${conflict.number}`);
      return tx.medicalAppointment.create({
        data: {
          tenantId,
          customerId: customer.id,
          serviceId: service.id,
          number: await nextNumberFastInTransaction(tx, "MA", tenantId),
          startAt,
          endAt,
          practitionerName: body.practitionerName,
          room: body.room || null,
          notes: body.notes || null,
          createdById: session.user.id,
        },
      });
    });
    await audit({ userId: session.user.id, action: "create", module: "medical_appointment", refId: result.id, detail: result.number });
    return NextResponse.json({ ok: true, appointment: result });
  }

  if (body.action === "STATUS") {
    const existing = await prisma.medicalAppointment.findFirst({ where: { id: body.appointmentId, tenantId }, select: { id: true, status: true } });
    if (!existing) throw new ApiError(404, "找不到預約");
    if (existing.status === "COMPLETED") throw new ApiError(409, "已完成療程不可改回進行中");
    const appointment = await prisma.medicalAppointment.update({ where: { id: existing.id }, data: { status: body.status } });
    return NextResponse.json({ ok: true, appointment });
  }

  if (body.action === "CONSENT") {
    const appointment = await prisma.medicalAppointment.findFirst({
      where: { id: body.appointmentId, tenantId },
      include: { customer: { select: { id: true } }, service: { include: { product: { select: { name: true } } } } },
    });
    if (!appointment) throw new ApiError(404, "找不到預約");
    const consent = await prisma.medicalConsent.create({
      data: {
        tenantId,
        customerId: appointment.customerId,
        serviceId: appointment.serviceId,
        appointmentId: appointment.id,
        title: `${appointment.service.product.name} 知情同意書`,
        documentVersion: "2026-07",
        status: "ACCEPTED",
        signedName: body.signedName,
        responses: body.responses as Prisma.InputJsonValue | undefined,
        acceptedAt: new Date(),
      },
    });
    await prisma.medicalAppointment.update({ where: { id: appointment.id }, data: { consentStatus: "ACCEPTED" } });
    await audit({ userId: session.user.id, action: "accept_consent", module: "medical_consent", refId: consent.id, detail: consent.title });
    return NextResponse.json({ ok: true, consent });
  }

  const completed = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`medical-treatment:${tenantId}:${body.appointmentId}`}))`;
    const appointment = await tx.medicalAppointment.findFirst({
      where: { id: body.appointmentId, tenantId },
      include: {
        service: {
          include: {
            product: { select: { name: true } },
            consumables: { include: { product: { select: { id: true, name: true, costPrice: true } } } },
          },
        },
        treatmentRecord: { select: { id: true } },
      },
    });
    if (!appointment) throw new ApiError(404, "找不到預約");
    if (appointment.treatmentRecord || appointment.status === "COMPLETED") throw new ApiError(409, "此療程已完成");
    if (appointment.service.consentRequired && appointment.consentStatus !== "ACCEPTED") throw new ApiError(409, "此療程需先完成同意書");

    const warehouse = await tx.warehouse.findFirst({ where: { tenantId, code: "MED-MAIN", isActive: true }, select: { id: true } });
    if (!warehouse) throw new ApiError(409, "尚未建立醫美主庫");
    let cogs = 0;
    for (const line of appointment.service.consumables) {
      const quantity = Number(line.quantity);
      const deducted = await tx.inventoryStock.updateMany({
        where: { tenantId, warehouseId: warehouse.id, productId: line.productId, quantity: { gte: quantity } },
        data: { quantity: { decrement: quantity } },
      });
      if (deducted.count !== 1) throw new ApiError(409, `${line.product.name} 庫存不足，無法完成療程`);
      cogs = roundMoney(cogs + quantity * Number(line.product.costPrice));
      await tx.inventoryTransaction.create({
        data: {
          tenantId,
          productId: line.productId,
          warehouseId: warehouse.id,
          type: "SALES_OUT",
          quantity: -quantity,
          unitCost: line.product.costPrice,
          refType: "MEDICAL_TREATMENT",
          refId: appointment.id,
          remark: `${appointment.number} ${appointment.service.product.name}`,
        },
      });
    }

    let deferredRevenueRecognized = 0;
    let packagePurchaseId: string | null = null;
    if (body.packagePurchaseId) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`medical-package:${tenantId}:${body.packagePurchaseId}`}))`;
      const purchase = await tx.medicalPackagePurchase.findFirst({
        where: {
          id: body.packagePurchaseId,
          tenantId,
          customerId: appointment.customerId,
          status: "ACTIVE",
          remainingSessions: { gt: 0 },
          validUntil: { gte: new Date() },
          package: { serviceId: appointment.serviceId },
        },
      });
      if (!purchase) throw new ApiError(409, "找不到可使用的有效套票");
      deferredRevenueRecognized = roundMoney(Number(purchase.paidAmount) / purchase.totalSessions);
      const remainingSessions = purchase.remainingSessions - 1;
      await tx.medicalPackagePurchase.update({
        where: { id: purchase.id },
        data: { remainingSessions, status: remainingSessions === 0 ? "USED_UP" : "ACTIVE" },
      });
      packagePurchaseId = purchase.id;
    }

    const record = await tx.medicalTreatmentRecord.create({
      data: {
        tenantId,
        appointmentId: appointment.id,
        customerId: appointment.customerId,
        serviceId: appointment.serviceId,
        packagePurchaseId,
        practitionerName: appointment.practitionerName,
        treatmentNotes: body.treatmentNotes || null,
        beforePhotoUrl: body.beforePhotoUrl || null,
        afterPhotoUrl: body.afterPhotoUrl || null,
        deferredRevenueRecognized,
      },
    });
    await tx.medicalAppointment.update({ where: { id: appointment.id }, data: { status: "COMPLETED" } });

    if (cogs > 0 || deferredRevenueRecognized > 0) {
      const numbers = await nextNumbersFastInTransaction(tx, ["JE"], tenantId);
      await createCheckoutJournal(tx, {
        tenantId,
        userId: session.user.id,
        journalNumber: numbers.JE,
        saleNumber: appointment.number,
        lines: [
          { code: "5101", debit: cogs, memo: `療程耗材成本－${appointment.number}` },
          { code: "1201", credit: cogs, memo: `療程耗材出庫－${appointment.number}` },
          { code: "2121", debit: deferredRevenueRecognized, memo: `套票預收款轉列－${appointment.number}` },
          { code: "4101", credit: deferredRevenueRecognized, memo: `療程收入認列－${appointment.number}` },
        ],
      });
    }
    return record;
  }, { isolationLevel: "ReadCommitted", maxWait: 10_000, timeout: 30_000 });

  await audit({ userId: session.user.id, action: "complete", module: "medical_treatment", refId: completed.id, detail: body.appointmentId });
  return NextResponse.json({ ok: true, treatmentRecord: completed });
});
