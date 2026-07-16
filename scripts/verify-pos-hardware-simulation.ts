import assert from "node:assert/strict";
import { analyzeBarcode, buildCustomerDisplayPayload, buildDrawerKickCommand, buildEscPosReceiptCommand, bytesToHex, normalizeHidBarcode, simulateEscPosPrinter, simulatePaymentTerminal, validateGtinChecksum } from "../src/lib/pos-hardware";

const drawer = buildDrawerKickCommand();
assert.equal(bytesToHex(drawer), "1B 70 00 02 14", "錢櫃命令必須符合 ESC p 格式");

const receipt = buildEscPosReceiptCommand(["ERIN POS", "TOTAL 100"]);
assert.deepEqual(Array.from(receipt.slice(0, 2)), [0x1b, 0x40], "收據必須先初始化印表機");
assert.deepEqual(Array.from(receipt.slice(-4)), [0x1d, 0x56, 0x42, 0x00], "收據必須以部分切紙命令結束");
assert.equal(simulateEscPosPrinter(receipt, "READY").state, "PRINTED");
assert.equal(simulateEscPosPrinter(receipt, "PAPER_OUT").shouldRetry, true);
assert.equal(simulateEscPosPrinter(Uint8Array.from([0x1b, 0x40]), "READY").state, "INVALID_COMMAND");

assert.equal(normalizeHidBarcode("4006381333931\r\n"), "4006381333931", "HID 掃碼必須移除結束字元");
assert.equal(validateGtinChecksum("4006381333931"), true);
assert.equal(validateGtinChecksum("4006381333932"), false);
assert.deepEqual(analyzeBarcode("4006381333931\r"), { code: "4006381333931", formatHint: "EAN-13", checksumValid: true, terminatorRemoved: true });
assert.equal(simulatePaymentTerminal(100, "APPROVED", "PAY-0001").approvedAmount, 100);
assert.equal(simulatePaymentTerminal(100, "DECLINED", "PAY-0002").approvedAmount, 0);
assert.equal(simulatePaymentTerminal(100, "TIMEOUT", "PAY-0003").mustReconcile, true);
assert.equal(simulatePaymentTerminal(100, "CANCELLED", "PAY-0004").state, "CANCELLED");

const display = buildCustomerDisplayPayload({ items: [{ name: "A", quantity: 1, amount: 100 }], total: 100, paid: 500, change: 400 });
assert.equal(display.change, 400);
assert.equal(display.items.length, 1);

console.log("POS hardware simulation checks passed: barcode, ESC/POS receipt, cash drawer, customer display and payment terminal states.");
