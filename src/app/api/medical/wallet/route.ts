import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, apiHandler, audit, requirePosPermission, requireTenantId } from "@/lib/api";
import { nextNumbersFastInTransaction } from "@/lib/number-sequence";
import { createCheckoutJournal } from "@/lib/pos-fulfillment";
import { prisma } from "@/lib/prisma";

const TopUpInput = z.object({
  customerId: z.string().min(1),
  amount: z.coerce.number().positive().max(10_000_000),
  paymentMethod: z.enum(["CASH", "CARD", "TRANSFER", "MOBILE"]),
  patientName: z.string().trim().min(1).max(100),
  reference: z.string().trim().max(100).optional().nullable(),
  note: z.string().trim().max(500).optional().nullable(),
});

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export const POST = apiHandler(async (req: NextRequest) => {
  const session = await requirePosPermission("create", "sales.create");
  const tenantId = await requireTenantId(session);
  const currentUser = (session.user as any).name || (session.user as any).username || session.user.id;
  const body = TopUpInput.parse(await req.json());
  const amount = roundMoney(body.amount);

  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`medical-wallet:${tenantId}:${body.customerId}`}))`;
    const customer = await tx.customer.findFirst({
      where: { id: body.customerId, tenantId, isActive: true },
      select: { id: true, companyName: true },
    });
    if (!customer) throw new ApiError(404, "找不到客戶");
    const wallet = await tx.medicalWallet.upsert({
      where: { customerId: customer.id },
      update: {},
      create: { tenantId, customerId: customer.id, balance: 0 },
    });
    const balanceAfter = roundMoney(Number(wallet.balance) + amount);
    const numbers = await nextNumbersFastInTransaction(tx, ["MW", "MR", "JE"], tenantId);
    await tx.medicalWallet.update({ where: { id: wallet.id }, data: { balance: balanceAfter } });
    const transaction = await tx.medicalWalletTransaction.create({
      data: {
        tenantId,
        walletId: wallet.id,
        number: numbers.MW,
        type: "TOP_UP",
        amount,
        balanceAfter,
        paymentMethod: body.paymentMethod,
        reference: body.reference || null,
        note: body.note || "會員儲值",
        createdById: session.user.id,
      },
    });
    const receipt = await tx.medicalReceipt.create({
      data: {
        tenantId,
        walletTransactionId: transaction.id,
        customerId: customer.id,
        number: numbers.MR,
        patientName: body.patientName,
        medicalItems: [],
        nonMedicalItems: [{ name: "會員儲值（預收款）", quantity: 1, unitPrice: amount, amount, kind: "PREPAYMENT" }],
        medicalAmount: 0,
        nonMedicalAmount: amount,
        total: amount,
        issuedByName: currentUser,
      },
    });
    await createCheckoutJournal(tx, {
      tenantId,
      userId: session.user.id,
      journalNumber: numbers.JE,
      saleNumber: transaction.number,
      lines: [
        {
          code: body.paymentMethod === "CASH" ? "1101" : "1103",
          debit: amount,
          memo: `會員儲值收款－${transaction.number}`,
        },
        { code: "2121", credit: amount, memo: `會員儲值預收款－${transaction.number}` },
      ],
    });
    return { transaction, receipt, balanceAfter };
  }, { isolationLevel: "ReadCommitted", maxWait: 10_000, timeout: 30_000 });

  await audit({
    userId: session.user.id,
    action: "top_up",
    module: "medical_wallet",
    refId: result.transaction.id,
    detail: `${body.patientName} ${amount}`,
  });
  return NextResponse.json({ ok: true, ...result });
});
