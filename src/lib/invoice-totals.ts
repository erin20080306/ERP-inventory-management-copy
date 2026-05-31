export type InvoiceLineInput = {
  description?: string | null;
  quantity?: number | string | null;
  unitPrice?: number | string | null;
  taxRate?: number | string | null;
};

export function roundInvoiceAmount(value: any) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n);
}

export function roundInvoiceTax(value: any) {
  return roundInvoiceAmount(value);
}

function roundMoney(value: any) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function calculateInvoiceTotals(items: InvoiceLineInput[]) {
  let amountExTaxRaw = 0;
  let taxRaw = 0;

  const computed = items.map((item) => {
    const quantity = Number(item.quantity ?? 0);
    const unitPrice = Number(item.unitPrice ?? 0);
    const taxRate = Number(item.taxRate ?? 0);
    const line = quantity * unitPrice;

    amountExTaxRaw += line;
    taxRaw += line * taxRate;

    return {
      description: item.description ?? "",
      quantity,
      unitPrice,
      taxRate,
      subtotal: roundMoney(line),
    };
  });

  const amountExTax = roundMoney(amountExTaxRaw);
  const taxAmount = roundInvoiceTax(taxRaw);
  const totalAmount = roundInvoiceAmount(amountExTax + taxAmount);

  return { amountExTax, taxAmount, totalAmount, computed };
}
