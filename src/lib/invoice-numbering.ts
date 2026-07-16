import { ApiError } from "./api";

type InvoiceTrackType = "SALES" | "PURCHASE";

export function taipeiInvoicePeriod(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "numeric",
  }).formatToParts(date);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  if (!Number.isInteger(year) || !Number.isInteger(month)) throw new Error("無法計算台灣發票期別");
  return { rocYear: year - 1911, period: Math.ceil(month / 2), month };
}

export async function allocateInvoiceTrackNumber(
  tx: any,
  input: { tenantId: string; type?: InvoiceTrackType; invoiceDate?: Date; required?: boolean },
) {
  const type = input.type ?? "SALES";
  const { rocYear, period } = taipeiInvoicePeriod(input.invoiceDate);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`invoice-track:${input.tenantId}:${type}:${rocYear}:${period}`}))`;
  const tracks = await tx.invoiceTrack.findMany({
    where: { tenantId: input.tenantId, type, year: rocYear, period, isActive: true },
    orderBy: [{ trackCode: "asc" }, { startNumber: "asc" }],
  });
  const track = tracks.find((item: any) => Number(item.currentNum) < Number(item.endNumber));
  if (!track) {
    if (!input.required) return null;
    throw new ApiError(409, `民國 ${rocYear} 年第 ${period} 期沒有可用的${type === "SALES" ? "銷項" : "進項"}電子發票字軌`);
  }
  const nextNumber = Math.max(Number(track.startNumber), Number(track.currentNum) + 1);
  if (nextNumber > Number(track.endNumber)) throw new ApiError(409, `${track.trackCode} 字軌已用完`);
  await tx.invoiceTrack.update({ where: { id: track.id }, data: { currentNum: nextNumber } });
  return {
    trackId: track.id,
    rocYear,
    period,
    trackCode: track.trackCode,
    sequence: nextNumber,
    invoiceNumber: `${track.trackCode}${String(nextNumber).padStart(8, "0")}`,
  };
}
