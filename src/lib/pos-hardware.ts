export type PaymentTerminalMode = "APPROVED" | "DECLINED" | "TIMEOUT" | "CANCELLED";
export type VirtualPrinterState = "READY" | "OFFLINE" | "PAPER_OUT" | "COVER_OPEN";

export function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0").toUpperCase()).join(" ");
}

// Epson ESC/POS ESC p m t1 t2。pin 0 通常是錢櫃接頭 2；脈衝時間單位 2 ms。
export function buildDrawerKickCommand(pin: 0 | 1 = 0, onTime = 2, offTime = 20) {
  if (!Number.isInteger(onTime) || onTime < 1 || onTime > 255) throw new Error("onTime 必須介於 1–255");
  if (!Number.isInteger(offTime) || offTime < 1 || offTime > 255) throw new Error("offTime 必須介於 1–255");
  return Uint8Array.from([0x1b, 0x70, pin, onTime, offTime]);
}

export function buildEscPosReceiptCommand(lines: string[]) {
  if (lines.length === 0 || lines.length > 200) throw new Error("收據行數必須介於 1–200");
  const encoder = new TextEncoder();
  const chunks: number[] = [0x1b, 0x40]; // ESC @ 初始化
  for (const line of lines) {
    if (line.includes("\0")) throw new Error("收據內容不可包含 NUL 控制字元");
    chunks.push(...encoder.encode(line), 0x0a);
  }
  chunks.push(0x0a, 0x0a, 0x0a, 0x1d, 0x56, 0x42, 0x00); // 進紙後部分切紙
  return Uint8Array.from(chunks);
}

export function normalizeHidBarcode(raw: string) {
  return raw.replace(/[\u0000-\u001f\u007f]/g, "").trim();
}

export function validateGtinChecksum(value: string) {
  if (!/^\d+$/.test(value) || ![8, 12, 13, 14].includes(value.length)) return null;
  const digits = value.split("").map(Number);
  const expected = digits.pop()!;
  const sum = digits.reverse().reduce((total, digit, index) => total + digit * (index % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === expected;
}

export function analyzeBarcode(raw: string) {
  const code = normalizeHidBarcode(raw);
  const formatHint = /^\d{8}$/.test(code) ? "EAN-8"
    : /^\d{12}$/.test(code) ? "UPC-A"
      : /^\d{13}$/.test(code) ? "EAN-13"
        : /^\d{14}$/.test(code) ? "GTIN-14"
          : /^\d+$/.test(code) ? "INTERNAL-NUMERIC"
            : code ? "CODE-128-OR-INTERNAL" : "EMPTY";
  return { code, formatHint, checksumValid: validateGtinChecksum(code), terminatorRemoved: /[\u0000-\u001f\u007f]/.test(raw) };
}

function includesSequence(bytes: Uint8Array, sequence: number[]) {
  return bytes.some((_byte, start) => sequence.every((value, offset) => bytes[start + offset] === value));
}

export function simulateEscPosPrinter(command: Uint8Array, state: VirtualPrinterState = "READY") {
  if (state !== "READY") {
    const messages: Record<Exclude<VirtualPrinterState, "READY">, string> = {
      OFFLINE: "模擬：印表機離線，禁止把交易標示為已列印",
      PAPER_OUT: "模擬：紙張用盡，保留補印佇列",
      COVER_OPEN: "模擬：上蓋開啟，保留補印佇列",
    };
    return { ok: false, state, acceptedBytes: 0, shouldRetry: true, message: messages[state] };
  }
  const initialized = command[0] === 0x1b && command[1] === 0x40;
  const cut = includesSequence(command, [0x1d, 0x56]);
  const drawerKick = includesSequence(command, [0x1b, 0x70]);
  if (!initialized || !cut) return { ok: false, state: "INVALID_COMMAND", acceptedBytes: 0, shouldRetry: false, initialized, cut, drawerKick, message: "模擬：ESC/POS 命令缺少初始化或切紙" };
  return { ok: true, state: "PRINTED", acceptedBytes: command.length, shouldRetry: false, initialized, cut, drawerKick, lineFeeds: Array.from(command).filter((byte) => byte === 0x0a).length, message: "模擬：虛擬 80mm 印表機已接收並切紙" };
}

export function simulatePaymentTerminal(amount: number, mode: PaymentTerminalMode, requestId = `SIM-${Date.now()}`) {
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("刷卡金額必須大於 0");
  const trace = `SIM${requestId.replace(/[^A-Za-z0-9]/g, "").slice(-12).padStart(12, "0")}`;
  if (mode === "TIMEOUT") return { ok: false, state: "TIMEOUT", trace, requestId, mustReconcile: true, approvedAmount: 0, message: "模擬：刷卡機逾時，POS 不得自行判定扣款成功；必須用同一交易碼查詢結果" };
  if (mode === "DECLINED") return { ok: false, state: "DECLINED", trace, requestId, mustReconcile: false, approvedAmount: 0, responseCode: "05", message: "模擬：發卡行拒絕交易" };
  if (mode === "CANCELLED") return { ok: false, state: "CANCELLED", trace, requestId, mustReconcile: false, approvedAmount: 0, responseCode: "CANCEL", message: "模擬：顧客或收銀員取消刷卡" };
  return { ok: true, state: "APPROVED", trace, requestId, mustReconcile: false, authCode: `T${trace.slice(-5)}`, responseCode: "00", amount, approvedAmount: amount, message: "模擬：授權成功（未連線收單銀行）" };
}

export function buildCustomerDisplayPayload(input: { items: Array<{ name: string; quantity: number; amount: number }>; total: number; paid?: number; change?: number; message?: string }) {
  for (const value of [input.total, input.paid ?? 0, input.change ?? 0]) {
    if (!Number.isFinite(Number(value)) || Number(value) < 0) throw new Error("客顯金額必須是非負有限數字");
  }
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    items: input.items.slice(-5),
    total: Math.round(input.total * 100) / 100,
    paid: Math.round(Number(input.paid ?? 0) * 100) / 100,
    change: Math.round(Number(input.change ?? 0) * 100) / 100,
    message: input.message ?? "歡迎光臨",
  };
}
