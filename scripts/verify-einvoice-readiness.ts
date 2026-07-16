import assert from "node:assert/strict";
import { getEInvoiceReadiness, isTaiwanTaxId, validateEInvoiceRequest } from "../src/lib/e-invoice";
import { allocateInvoiceTrackNumber, taipeiInvoicePeriod } from "../src/lib/invoice-numbering";

async function main() {
  assert.equal(isTaiwanTaxId("04595257"), true, "有效統編應通過檢查碼");
  assert.equal(isTaiwanTaxId("12345678"), false, "無效統編不得通過");
  validateEInvoiceRequest({ mode: "BUSINESS", buyerTaxId: "04595257" });
  validateEInvoiceRequest({ mode: "MOBILE_CARRIER", carrierId: "/ABC+123" });
  assert.throws(() => validateEInvoiceRequest({ mode: "BUSINESS", buyerTaxId: "12345678" }), /有效的 8 碼/);
  assert.throws(() => validateEInvoiceRequest({ mode: "MOBILE_CARRIER", carrierId: "ABC" }), /手機條碼格式錯誤/);

  const localMock = getEInvoiceReadiness({
  EINVOICE_PROVIDER: "MOCK",
  EINVOICE_ALLOW_MOCK: "true",
  NEXTAUTH_URL: "http://localhost:3100",
});
  assert.equal(localMock.ready, true);
  assert.equal(localMock.environment, "LOCAL");

  const remoteMock = getEInvoiceReadiness({
  EINVOICE_PROVIDER: "MOCK",
  EINVOICE_ALLOW_MOCK: "true",
  NEXTAUTH_URL: "https://erp.example.com",
});
  assert.equal(remoteMock.ready, false);

  const turnkey = getEInvoiceReadiness({
  EINVOICE_PROVIDER: "TURNKEY",
  EINVOICE_ENV: "TEST",
  EINVOICE_MIG_VERSION: "4.1",
  EINVOICE_SELLER_TAX_ID: "04595257",
  EINVOICE_TURNKEY_OUTBOX_DIR: "/turnkey/out",
  EINVOICE_TURNKEY_ACK_DIR: "/turnkey/ack",
});
  assert.equal(turnkey.ready, false, "未取得官方驗測前不得誤標正式可用");
  assert(turnkey.blockers.some((item) => item.includes("端對端驗測")));

  const legacyVan = getEInvoiceReadiness({ EINVOICE_PROVIDER: "VAC" });
  assert.equal(legacyVan.provider, "VAN", "舊 VAC 設定應轉為 VAN 顯示");

  assert.deepEqual(taipeiInvoicePeriod(new Date("2026-07-16T12:00:00Z")), { rocYear: 115, period: 4, month: 7 });

  let updatedSequence = 0;
  const fakeTx = {
  $executeRaw: async () => 0,
  invoiceTrack: {
    findMany: async () => [{ id: "track-1", trackCode: "AB", startNumber: 1, endNumber: 50, currentNum: 9 }],
    update: async ({ data }: any) => { updatedSequence = data.currentNum; },
  },
};
  const allocated = await allocateInvoiceTrackNumber(fakeTx, { tenantId: "tenant-1", type: "SALES", invoiceDate: new Date("2026-07-16T12:00:00Z"), required: true });
  assert.equal(allocated?.invoiceNumber, "AB00000010");
  assert.equal(updatedSequence, 10);

  console.log("Electronic invoice readiness, validation, period and locked numbering: PASS");
}

void main();
