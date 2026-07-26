import { Prisma } from "@prisma/client";

export type MoneyAuditItem = {
  quantity: number;
  unitPrice: number;
  discount?: number;
  taxRate?: number;
};

export type MoneyAuditTotals = {
  subtotal: number;
  discount: number;
  taxAmount: number;
  total: number;
  computed?: Array<{
    quantity: number;
    unitPrice: number;
    discount?: number;
    taxRate?: number;
    subtotal: number;
  }>;
};

export type MoneyAuditDifference = {
  field: string;
  legacy: number;
  decimal: number;
  delta: number;
};

function decimal(value: unknown) {
  const normalized = value === null || value === undefined || value === "" ? "0" : String(value);
  return new Prisma.Decimal(normalized);
}

// 與 JavaScript Math.round 對齊，包括負數剛好位於 .5 時朝正無限大取整。
function mathRoundDecimal(value: Prisma.Decimal) {
  return value.add(0.5).floor();
}

function roundScale(value: Prisma.Decimal, scale: number) {
  const factor = new Prisma.Decimal(10).pow(scale);
  return mathRoundDecimal(value.mul(factor)).div(factor);
}

function asNumber(value: Prisma.Decimal) {
  return Number(value.toString());
}

export function calculateDocumentTotalsDecimal(items: MoneyAuditItem[], isTaxable = true): MoneyAuditTotals {
  let subtotal = decimal(0);
  let discount = decimal(0);
  let taxAmount = decimal(0);

  const computed = items.map((item) => {
    const quantity = roundScale(decimal(item.quantity), 4);
    const unitPrice = roundScale(decimal(item.unitPrice), 4);
    const line = mathRoundDecimal(quantity.mul(unitPrice));
    const lineDiscount = mathRoundDecimal(decimal(item.discount ?? 0));
    const taxable = mathRoundDecimal(line.sub(lineDiscount));
    const taxRate = isTaxable ? decimal(item.taxRate ?? 0.05) : decimal(0);
    const lineTax = mathRoundDecimal(taxable.mul(taxRate));

    subtotal = subtotal.add(line);
    discount = discount.add(lineDiscount);
    taxAmount = taxAmount.add(lineTax);

    return {
      quantity: asNumber(quantity),
      unitPrice: asNumber(unitPrice),
      discount: asNumber(lineDiscount),
      taxRate: asNumber(taxRate),
      subtotal: asNumber(taxable),
    };
  });

  subtotal = mathRoundDecimal(subtotal);
  discount = mathRoundDecimal(discount);
  taxAmount = mathRoundDecimal(taxAmount);
  const total = mathRoundDecimal(subtotal.sub(discount).add(taxAmount));

  return {
    subtotal: asNumber(subtotal),
    discount: asNumber(discount),
    taxAmount: asNumber(taxAmount),
    total: asNumber(total),
    computed,
  };
}

function compareField(
  differences: MoneyAuditDifference[],
  field: string,
  legacyValue: unknown,
  decimalValue: unknown,
) {
  const legacy = Number(legacyValue ?? 0);
  const precise = Number(decimalValue ?? 0);
  if (!Number.isFinite(legacy) || !Number.isFinite(precise) || Object.is(legacy, precise)) return;
  const delta = precise - legacy;
  if (Math.abs(delta) < 1e-9) return;
  differences.push({ field, legacy, decimal: precise, delta });
}

export function compareMoneySnapshots(
  scope: string,
  legacy: MoneyAuditTotals,
  precise: MoneyAuditTotals,
  metadata: Record<string, string | number | boolean | null | undefined> = {},
) {
  const differences: MoneyAuditDifference[] = [];
  for (const field of ["subtotal", "discount", "taxAmount", "total"] as const) {
    compareField(differences, field, legacy[field], precise[field]);
  }

  const legacyLines = legacy.computed ?? [];
  const preciseLines = precise.computed ?? [];
  for (let index = 0; index < Math.max(legacyLines.length, preciseLines.length); index += 1) {
    const legacyLine = legacyLines[index];
    const preciseLine = preciseLines[index];
    if (!legacyLine || !preciseLine) {
      differences.push({ field: `items[${index}]`, legacy: legacyLine ? 1 : 0, decimal: preciseLine ? 1 : 0, delta: preciseLine ? 1 : -1 });
      continue;
    }
    for (const field of ["quantity", "unitPrice", "discount", "taxRate", "subtotal"] as const) {
      compareField(differences, `items[${index}].${field}`, legacyLine[field], preciseLine[field]);
    }
  }

  if (differences.length && process.env.MONEY_DECIMAL_AUDIT !== "false") {
    console.warn(JSON.stringify({
      type: "MONEY_DECIMAL_AUDIT",
      scope,
      metadata,
      differences,
      observedAt: new Date().toISOString(),
    }));
  }

  return { matched: differences.length === 0, differences };
}

export function auditDocumentTotalsDecimal(
  scope: string,
  items: MoneyAuditItem[],
  isTaxable: boolean,
  legacy: MoneyAuditTotals,
  metadata: Record<string, string | number | boolean | null | undefined> = {},
) {
  const precise = calculateDocumentTotalsDecimal(items, isTaxable);
  return compareMoneySnapshots(scope, legacy, precise, metadata);
}
