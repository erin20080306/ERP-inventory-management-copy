import { randomInt } from "node:crypto";
import { ApiError } from "./api";
import { allocateInvoiceTrackNumber } from "./invoice-numbering";
import { prisma } from "./prisma";

export type EInvoiceMode = "PAPER" | "MOBILE_CARRIER" | "CITIZEN_CERT" | "DONATION" | "BUSINESS";
export type EInvoiceProviderName = "MOCK" | "TURNKEY" | "VAN";
export type EInvoiceEnvironment = "LOCAL" | "TEST" | "PRODUCTION" | "UNSET";

export type EInvoiceRequest = {
  mode: EInvoiceMode;
  buyerTaxId?: string | null;
  carrierType?: string | null;
  carrierId?: string | null;
  donationCode?: string | null;
};

type EInvoiceEnv = Record<string, string | undefined>;

function isLoopbackPreview(env: EInvoiceEnv = process.env) {
  try {
    const host = new URL(env.NEXTAUTH_URL ?? "").hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}

export function isTaiwanTaxId(value: string) {
  if (!/^\d{8}$/.test(value)) return false;
  const weights = [1, 2, 1, 2, 1, 2, 4, 1];
  const digits = value.split("").map(Number);
  const sum = digits.reduce((total, digit, index) => {
    const product = digit * weights[index];
    return total + Math.floor(product / 10) + (product % 10);
  }, 0);
  return sum % 10 === 0 || (digits[6] === 7 && (sum + 1) % 10 === 0);
}

function configuredProvider(env: EInvoiceEnv) {
  const raw = (env.EINVOICE_PROVIDER ?? "").trim().toUpperCase();
  if (raw === "VAC") return "VAN" as const;
  if (["MOCK", "TURNKEY", "VAN"].includes(raw)) return raw as EInvoiceProviderName;
  return null;
}

export function getEInvoiceReadiness(env: EInvoiceEnv = process.env) {
  const provider = configuredProvider(env);
  const rawEnvironment = (env.EINVOICE_ENV ?? "").trim().toUpperCase();
  const environment: EInvoiceEnvironment = provider === "MOCK"
    ? "LOCAL"
    : (["TEST", "PRODUCTION"].includes(rawEnvironment) ? rawEnvironment as "TEST" | "PRODUCTION" : "UNSET");
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (!provider) blockers.push("尚未選擇 Turnkey 或 VAN 電子發票服務");
  if (provider === "MOCK") {
    if (env.EINVOICE_ALLOW_MOCK !== "true" || !isLoopbackPreview(env)) blockers.push("模擬發票只允許在 localhost 本機預覽");
    warnings.push("TEST- 號碼不會上傳財政部，不可報稅或兌獎");
  }
  if (provider && provider !== "MOCK") {
    if (environment === "UNSET") blockers.push("EINVOICE_ENV 必須明確設定 TEST 或 PRODUCTION");
    if ((env.EINVOICE_MIG_VERSION ?? "").trim() !== "4.1") blockers.push("2026 年新介接須設定 MIG 4.1");
    if (!isTaiwanTaxId((env.EINVOICE_SELLER_TAX_ID ?? "").trim())) blockers.push("缺少有效的 8 碼賣方統一編號");
    if (provider === "TURNKEY") {
      if (!(env.EINVOICE_TURNKEY_OUTBOX_DIR ?? "").trim()) blockers.push("缺少 Turnkey MIG 4.1 上傳來源目錄");
      if (!(env.EINVOICE_TURNKEY_ACK_DIR ?? "").trim()) blockers.push("缺少 Turnkey 回覆／確認目錄");
      blockers.push("尚未取得測試帳密、字軌與憑證，也尚未用官方 XSD 完成 MIG 4.1 端對端驗測");
    }
    if (provider === "VAN") {
      if (!(env.EINVOICE_VAN_NAME ?? "").trim()) blockers.push("尚未指定 VAN 加值服務中心名稱與 API 版本");
      if (!(env.EINVOICE_VAN_BASE_URL ?? "").trim()) blockers.push("缺少 VAN 測試／正式端點");
      if (!(env.EINVOICE_VAN_CLIENT_ID ?? "").trim() || !(env.EINVOICE_VAN_CLIENT_SECRET ?? "").trim()) blockers.push("缺少 VAN 介接憑證");
      blockers.push("尚未取得該 VAN 的開立、作廢、折讓與查詢規格及測試認證");
    }
    if (environment === "PRODUCTION") warnings.push("正式環境只能在測試平台驗測、字軌與憑證全部通過後啟用");
  }

  return {
    provider: provider ?? "UNCONFIGURED",
    environment,
    migVersion: (env.EINVOICE_MIG_VERSION ?? "").trim() || null,
    sellerTaxIdConfigured: Boolean((env.EINVOICE_SELLER_TAX_ID ?? "").trim()),
    ready: blockers.length === 0,
    blockers,
    warnings,
    transmissionDeadlineHours: 48,
    checkedAt: new Date().toISOString(),
  };
}

export function getEInvoiceProvider(): EInvoiceProviderName {
  const readiness = getEInvoiceReadiness();
  if (readiness.provider === "UNCONFIGURED") throw new ApiError(503, readiness.blockers[0]);
  if (readiness.provider === "MOCK" && !readiness.ready) throw new ApiError(503, readiness.blockers.join("；"));
  return readiness.provider as EInvoiceProviderName;
}

function assertProviderReady(provider: EInvoiceProviderName) {
  const readiness = getEInvoiceReadiness();
  if (readiness.provider !== provider || !readiness.ready) {
    throw new ApiError(503, readiness.blockers.join("；") || "電子發票介接尚未完成驗測");
  }
}

export function validateEInvoiceRequest(input: EInvoiceRequest) {
  if (input.mode === "BUSINESS" && !isTaiwanTaxId(input.buyerTaxId ?? "")) {
    throw new ApiError(400, "公司戶電子發票必須填寫有效的 8 碼買方統一編號");
  }
  if (input.mode === "MOBILE_CARRIER" && !/^\/[0-9A-Z.+-]{7}$/.test((input.carrierId ?? "").toUpperCase())) {
    throw new ApiError(400, "手機條碼格式錯誤，應為 / 開頭加 7 碼大寫英數字或 .+-");
  }
  if (input.mode === "CITIZEN_CERT" && !/^[A-Z]{2}\d{14}$/.test((input.carrierId ?? "").toUpperCase())) {
    throw new ApiError(400, "自然人憑證載具格式錯誤");
  }
  if (input.mode === "DONATION" && !/^\d{3,7}$/.test(input.donationCode ?? "")) {
    throw new ApiError(400, "捐贈碼應為 3 至 7 碼數字");
  }
}

export async function createEInvoiceOutbox(
  tx: any,
  input: { tenantId: string; sale: any; request: EInvoiceRequest },
) {
  validateEInvoiceRequest(input.request);
  const provider = getEInvoiceProvider();
  assertProviderReady(provider);
  const official = provider !== "MOCK";
  const issuedAt = new Date();
  const allocation = official
    ? await allocateInvoiceTrackNumber(tx, { tenantId: input.tenantId, type: "SALES", invoiceDate: issuedAt, required: true })
    : null;
  const randomCode = official ? String(randomInt(0, 10_000)).padStart(4, "0") : null;
  const [company, customer] = await Promise.all([
    tx.companySetting.findFirst({ where: { tenantId: input.tenantId }, select: { name: true, taxId: true, address: true, phone: true } }),
    input.sale.customerId
      ? tx.customer.findFirst({ where: { id: input.sale.customerId, tenantId: input.tenantId }, select: { companyName: true, taxId: true } })
      : null,
  ]);
  if (official && company?.taxId !== process.env.EINVOICE_SELLER_TAX_ID) {
    throw new ApiError(409, "公司設定統編與電子發票憑證的賣方統編不一致");
  }
  const printMark = ["PAPER", "BUSINESS"].includes(input.request.mode);
  const invoice = await tx.electronicInvoice.create({
    data: {
      tenantId: input.tenantId,
      posSaleId: input.sale.id,
      provider,
      mode: input.request.mode,
      invoiceNumber: allocation?.invoiceNumber ?? null,
      randomCode,
      buyerTaxId: input.request.mode === "BUSINESS" ? input.request.buyerTaxId : null,
      carrierType: input.request.mode === "MOBILE_CARRIER"
        ? "3J0002"
        : input.request.mode === "CITIZEN_CERT"
          ? "CQ0001"
          : null,
      carrierId: ["MOBILE_CARRIER", "CITIZEN_CERT"].includes(input.request.mode) ? input.request.carrierId?.toUpperCase() || null : null,
      donationCode: input.request.mode === "DONATION" ? input.request.donationCode || null : null,
      printMark,
    },
  });
  const event = await tx.electronicInvoiceEvent.create({
    data: {
      tenantId: input.tenantId,
      invoiceId: invoice.id,
      type: "ISSUE",
      payload: {
        schema: "erin-einvoice-outbox-v2",
        seller: { name: company?.name ?? null, taxId: company?.taxId ?? null, address: company?.address ?? null, phone: company?.phone ?? null },
        buyer: {
          name: customer?.companyName ?? "門市散客",
          taxId: input.request.mode === "BUSINESS" ? input.request.buyerTaxId || customer?.taxId || null : null,
        },
        invoice: {
          number: allocation?.invoiceNumber ?? null,
          randomCode,
          issuedAt: issuedAt.toISOString(),
          mode: input.request.mode,
          printMark,
          carrierType: input.request.mode === "MOBILE_CARRIER" ? "3J0002" : input.request.mode === "CITIZEN_CERT" ? "CQ0001" : null,
          carrierId: input.request.carrierId?.toUpperCase() || null,
          donationCode: input.request.donationCode || null,
          saleId: input.sale.id,
          saleNumber: input.sale.number,
          subtotal: Number(input.sale.subtotal ?? 0),
          discount: Number(input.sale.discount ?? 0),
          taxAmount: Number(input.sale.taxAmount),
          total: Number(input.sale.total),
        },
        items: (input.sale.items ?? []).map((item: any) => ({
          productId: item.productId,
          sku: item.product?.sku ?? null,
          name: item.product?.name ?? null,
          quantity: Number(item.quantity),
          unitPrice: Number(item.unitPrice),
          discount: Number(item.discount ?? 0),
          taxRate: Number(item.taxRate ?? 0.05),
          subtotal: Number(item.subtotal),
        })),
      },
      providerRequestId: null,
    },
  });
  await tx.electronicInvoiceEvent.update({ where: { id: event.id }, data: { providerRequestId: event.id } });
  return { invoice, eventId: event.id };
}

function nextRetry(attempts: number) {
  const delayMinutes = Math.min(60, 2 ** Math.min(6, Math.max(0, attempts - 1)));
  return new Date(Date.now() + delayMinutes * 60_000);
}

async function runProvider(event: any) {
  const provider = event.invoice.provider === "VAC" ? "VAN" : event.invoice.provider as EInvoiceProviderName;
  assertProviderReady(provider);
  if (provider !== "MOCK") {
    throw new Error(`${provider === "TURNKEY" ? "財政部 Turnkey MIG 4.1" : "VAN"} 介接器尚未完成端對端認證，不允許送正式資料`);
  }
  if (event.type === "ISSUE") {
    return { invoiceNumber: `TEST-${event.invoice.id.slice(-12).toUpperCase()}`, randomCode: "TEST", issuedAt: new Date().toISOString(), requestId: event.providerRequestId };
  }
  if (event.type === "VOID") return { voidedAt: new Date().toISOString(), requestId: event.providerRequestId };
  if (event.type === "ALLOWANCE") return { allowanceNumber: `TEST-AL-${event.id.slice(-8).toUpperCase()}`, requestId: event.providerRequestId };
  return { requestId: event.providerRequestId };
}

export async function processEInvoiceEvent(eventId: string) {
  const staleAt = new Date(Date.now() - 10 * 60_000);
  const claim = await prisma.$transaction(async (tx: any) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`einvoice-event:${eventId}`}))`;
    const event = await tx.electronicInvoiceEvent.findUnique({ where: { id: eventId }, include: { invoice: true } });
    if (!event || event.status === "COMPLETED") return { event, shouldProcess: false };
    if (event.status === "PROCESSING" && event.processingStartedAt && event.processingStartedAt > staleAt) {
      return { event, shouldProcess: false };
    }
    const claimed = await tx.electronicInvoiceEvent.update({
      where: { id: event.id },
      data: {
        status: "PROCESSING",
        attempts: { increment: 1 },
        processingStartedAt: new Date(),
        providerRequestId: event.providerRequestId || event.id,
        lastError: null,
      },
      include: { invoice: true },
    });
    return { event: claimed, shouldProcess: true };
  });
  if (!claim.event || !claim.shouldProcess) return claim.event;
  const claimed = claim.event;

  try {
    const providerResult = await runProvider(claimed);
    const providerResponse = JSON.parse(JSON.stringify(providerResult));
    await prisma.$transaction(async (tx: any) => {
      const invoiceData = claimed.type === "ISSUE"
        ? {
            status: "ISSUED",
            invoiceNumber: providerResult.invoiceNumber ?? claimed.invoice.invoiceNumber,
            randomCode: providerResult.randomCode ?? claimed.invoice.randomCode,
            issuedAt: providerResult.issuedAt ? new Date(providerResult.issuedAt) : new Date(),
            lastError: null,
          }
        : claimed.type === "VOID"
          ? { status: "VOIDED", voidedAt: providerResult.voidedAt ? new Date(providerResult.voidedAt) : new Date(), lastError: null }
          : { lastError: null };
      await tx.electronicInvoice.update({ where: { id: claimed.invoiceId }, data: invoiceData });
      await tx.electronicInvoiceEvent.update({
        where: { id: claimed.id },
        data: { status: "COMPLETED", processedAt: new Date(), processingStartedAt: null, nextRetryAt: null, lastError: null, providerResponse },
      });
    });
  } catch (error) {
    const message = String(error instanceof Error ? error.message : error).slice(0, 1000);
    await prisma.$transaction([
      prisma.electronicInvoiceEvent.update({
        where: { id: claimed.id },
        data: { status: "FAILED", processingStartedAt: null, lastError: message, nextRetryAt: nextRetry(claimed.attempts) },
      }),
      ...(claimed.type === "ISSUE"
        ? [prisma.electronicInvoice.update({ where: { id: claimed.invoiceId }, data: { status: "FAILED", lastError: message } })]
        : []),
    ]);
  }
  return prisma.electronicInvoiceEvent.findUnique({ where: { id: eventId }, include: { invoice: true } });
}

export async function queueEInvoiceAllowance(options: { tenantId: string; saleId: string; refundId: string; refundNumber: string; amount: number }) {
  const invoice = await prisma.electronicInvoice.findFirst({ where: { tenantId: options.tenantId, posSaleId: options.saleId, status: "ISSUED" } });
  if (!invoice) return null;
  const duplicate = await prisma.electronicInvoiceEvent.findFirst({ where: { invoiceId: invoice.id, type: "ALLOWANCE", payload: { path: ["refundId"], equals: options.refundId } } });
  if (duplicate) return duplicate;
  const event = await prisma.electronicInvoiceEvent.create({
    data: {
      tenantId: options.tenantId,
      invoiceId: invoice.id,
      type: "ALLOWANCE",
      providerRequestId: null,
      payload: { schema: "erin-einvoice-allowance-v2", refundId: options.refundId, refundNumber: options.refundNumber, amount: options.amount },
    },
  });
  await prisma.electronicInvoiceEvent.update({ where: { id: event.id }, data: { providerRequestId: event.id } });
  return processEInvoiceEvent(event.id);
}

export async function processDueEInvoiceEvents(limit = 20) {
  const now = new Date();
  const staleAt = new Date(now.getTime() - 10 * 60_000);
  const events = await prisma.electronicInvoiceEvent.findMany({
    where: {
      OR: [
        { status: "PENDING" },
        { status: "FAILED", attempts: { lt: 12 }, nextRetryAt: { lte: now } },
        { status: "PROCESSING", processingStartedAt: { lte: staleAt } },
        { status: "PROCESSING", processingStartedAt: null },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: Math.max(1, Math.min(100, limit)),
    select: { id: true },
  });
  const results = [];
  for (const event of events) results.push(await processEInvoiceEvent(event.id));
  return results;
}
