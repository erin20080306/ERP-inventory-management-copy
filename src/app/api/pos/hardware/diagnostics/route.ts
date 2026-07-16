import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler, audit, requirePosPermission } from "@/lib/api";
import { analyzeBarcode, buildDrawerKickCommand, buildEscPosReceiptCommand, bytesToHex, simulateEscPosPrinter, simulatePaymentTerminal } from "@/lib/pos-hardware";

export const GET = apiHandler(async () => {
  await requirePosPermission("view", "sales.view");
  const drawer = buildDrawerKickCommand();
  const receipt = buildEscPosReceiptCommand(["ERIN POS DEVICE TEST", "TOTAL NT$ 100", "*** SIMULATION ONLY ***"]);
  return NextResponse.json({
    mode: "SIMULATION",
    warning: "目前未連接實機；這裡驗證指令、資料格式與錯誤分支，不代表 USB／網路驅動及電氣相容性通過。",
    devices: {
      barcode: { protocol: "USB/Bluetooth HID keyboard", sample: analyzeBarcode("4006381333931\r") },
      printer: { protocol: "OS driver print or model-specific ESC/POS", width: "80mm", commandHex: bytesToHex(receipt), byteLength: receipt.length, simulation: simulateEscPosPrinter(receipt) },
      drawer: { protocol: "ESC/POS ESC p", commandHex: bytesToHex(drawer) },
      customerDisplay: { protocol: "Browser BroadcastChannel simulation", channel: "erin-pos-customer-display" },
      paymentTerminal: { protocol: "Adapter state-machine simulation", modes: ["APPROVED", "DECLINED", "TIMEOUT", "CANCELLED"] },
    },
  });
});

const DiagnosticInput = z.discriminatedUnion("action", [
  z.object({ action: z.literal("DRAWER_TEST") }),
  z.object({ action: z.literal("PRINTER_TEST"), state: z.enum(["READY", "OFFLINE", "PAPER_OUT", "COVER_OPEN"]).default("READY") }),
  z.object({ action: z.literal("BARCODE_TEST"), raw: z.string().max(200) }),
  z.object({ action: z.literal("PAYMENT_TEST"), amount: z.coerce.number().positive(), mode: z.enum(["APPROVED", "DECLINED", "TIMEOUT", "CANCELLED"]), requestId: z.string().min(8).max(100).optional() }),
]);

export const POST = apiHandler(async (req: NextRequest) => {
  const session = await requirePosPermission("create", "sales.create");
  const body = DiagnosticInput.parse(await req.json());
  let result: any;
  if (body.action === "DRAWER_TEST") result = { commandHex: bytesToHex(buildDrawerKickCommand()), simulated: true };
  if (body.action === "PRINTER_TEST") {
    const command = buildEscPosReceiptCommand(["ERIN POS DEVICE TEST", new Date().toISOString(), "*** NO REAL PRINT ***"]);
    result = { commandHex: bytesToHex(command), byteLength: command.length, simulated: true, transport: simulateEscPosPrinter(command, body.state) };
  }
  if (body.action === "BARCODE_TEST") result = { ...analyzeBarcode(body.raw), simulated: true };
  if (body.action === "PAYMENT_TEST") result = simulatePaymentTerminal(body.amount, body.mode, body.requestId);
  await audit({ userId: session.user.id, action: body.action.toLowerCase(), module: "pos-hardware", detail: JSON.stringify(result).slice(0, 500) });
  return NextResponse.json({ ok: true, result });
});
