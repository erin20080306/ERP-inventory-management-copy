/**
 * 台灣電子發票 QR Code 解析
 *
 * 左 QR Code 格式（前 77 個字元為主要資訊，UTF-8 BIG5 編碼）：
 * - 0..9   發票字軌號碼 (10碼)  例: AB12345678
 * - 10..16 發票開立日期 民國年月日 YYYMMDD (7碼)
 * - 17..20 隨機碼 (4碼)
 * - 21..28 銷售額 (含稅前金額, 8碼16進位)
 * - 29..36 總計額 (8碼16進位)
 * - 37..44 買方統編 (8碼)
 * - 45..52 賣方統編 (8碼)
 * - 53..76 加密驗證資訊 (24碼)
 * - 77..   附加資訊（品項數、品項明細）以 ":" 分隔
 *
 * 右 QR Code 格式：以 "**" 開頭，後接品項以 ":" 分隔
 */

export type ParsedInvoiceQRItem = { name: string; quantity?: number; unitPrice?: number };

export type ParsedInvoiceQR = {
  invoiceNumber?: string;
  date?: string; // YYYY-MM-DD (西元)
  rocDate?: string; // YYY/MM/DD (民國)
  random?: string;
  amountExTax?: number;
  taxAmount?: number;
  totalAmount?: number;
  buyerTaxId?: string;
  sellerTaxId?: string;
  items?: ParsedInvoiceQRItem[];
  raw?: { left?: string; right?: string };
};

function rocToISO(roc: string): string | undefined {
  // roc: YYYMMDD (民國) e.g. 1130103 → 2024-01-03
  if (!/^\d{7}$/.test(roc)) return undefined;
  const y = parseInt(roc.slice(0, 3), 10) + 1911;
  const m = roc.slice(3, 5);
  const d = roc.slice(5, 7);
  return `${y}-${m}-${d}`;
}

export function parseTaiwanInvoiceQR(left: string, right?: string): ParsedInvoiceQR {
  const out: ParsedInvoiceQR = { raw: { left, right } };

  if (left && left.length >= 53) {
    out.invoiceNumber = left.slice(0, 10);
    const rocDate = left.slice(10, 17);
    out.rocDate = rocDate;
    out.date = rocToISO(rocDate);
    out.random = left.slice(17, 21);
    try {
      out.amountExTax = parseInt(left.slice(21, 29), 16);
    } catch {}
    try {
      out.totalAmount = parseInt(left.slice(29, 37), 16);
    } catch {}
    if (out.totalAmount != null && out.amountExTax != null) {
      out.taxAmount = out.totalAmount - out.amountExTax;
    }
    out.buyerTaxId = left.slice(37, 45).replace(/^0+$/, "") || undefined;
    out.sellerTaxId = left.slice(45, 53) || undefined;
  }

  // 品項：左 QR 第 77 字元後 或 右 QR
  const itemsText = (left && left.length > 77 ? left.slice(77) : "") + (right?.startsWith("**") ? right.slice(2) : right ?? "");
  if (itemsText) {
    const parts = itemsText.split(":").filter(Boolean);
    // 通常格式: 個數:格式碼:品名1:數量1:單價1:品名2:...
    // 簡化處理：忽略前兩個欄位，每 3 個為一項
    const items: ParsedInvoiceQRItem[] = [];
    let start = 0;
    // 嘗試取得品項
    while (start + 2 < parts.length) {
      const name = parts[start];
      const qty = Number(parts[start + 1]);
      const price = Number(parts[start + 2]);
      if (name && !isNaN(qty) && !isNaN(price)) {
        items.push({ name, quantity: qty, unitPrice: price });
        start += 3;
      } else {
        start += 1;
      }
    }
    if (items.length > 0) out.items = items;
  }

  return out;
}
