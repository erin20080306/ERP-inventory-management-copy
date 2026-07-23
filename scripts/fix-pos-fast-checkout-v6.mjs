import { readFileSync, writeFileSync } from "node:fs";

const path = "src/app/api/pos/checkout/route.ts";
let source = readFileSync(path, "utf8");

function replaceRequired(pattern, replacement, label) {
  if (!pattern.test(source)) throw new Error(`找不到要修正的區塊：${label}`);
  source = source.replace(pattern, replacement);
}

if (source.includes("async function createCheckoutJournal")) {
  replaceRequired(/\nasync function createCheckoutJournal\([\s\S]*?\n}\n\nexport const POST/, "\nexport const POST", "前台傳票函式");
}

if (source.includes("const order = await tx.salesOrder.create")) {
  replaceRequired(
    /\n    const order = await tx\.salesOrder\.create\([\s\S]*?await tx\.receivePayment\.create\([\s\S]*?\);\n\n    const sale = await tx\.posSale\.create\(/,
    "\n    const sale = await tx.posSale.create(",
    "前台 ERP 銷售／應收／收款單",
  );
}

if (source.includes("await tx.inventoryTransaction.createMany")) {
  replaceRequired(
    /\n    await tx\.inventoryTransaction\.createMany\([\s\S]*?\n    return \{ sale, replayed: false,/,
    "\n    return { sale, replayed: false,",
    "前台庫存流水與會計傳票",
  );
}

source = source.replace('type CheckoutJournalLine = { code: string; debit?: number; credit?: number; memo: string };\n\n', "");
source = source.replace('import { lockAndAssertAccountingPeriodOpen } from "@/lib/accounting-controls";\n', "");
writeFileSync(path, source);
console.log("POS fast checkout v6 cleanup applied");
