export const CUSTOM_FIELD_MODULE_ACCESS = {
  products: "products",
  customers: "customers",
  suppliers: "suppliers",
  warehouses: "warehouses",
  inventory: "inventory",
  employees: "hr",
  departments: "hr",
  accounts: "accounting",
  purchases: "purchases",
  sales: "sales",
  quotations: "quotations",
  returns: "returns",
  receivables: "receivables",
  payables: "payables",
  "notes-receivable": "notes",
  "notes-payable": "notes",
  payroll: "payroll",
  invoices: "invoices",
  journals: "journals",
  "fixed-assets": "assets",
  payments: "receivables",
  costs: "products",
  "bom-products": "products",
  "bom-customers": "customers",
  "bom-suppliers": "suppliers",
  "bom-purchases": "purchases",
  "bom-sales": "sales",
  "bom-quotations": "quotations",
  "bom-accounts": "accounting",
  "bom-journals": "journals",
  "bom-receivables": "receivables",
  "bom-payables": "payables",
  "bom-notes-receivable": "notes",
  "bom-notes-payable": "notes",
  "bom-invoices": "invoices",
  "bom-fixed-assets": "assets",
  "bom-employees": "hr",
  "bom-departments": "hr",
} as const;

export type CustomFieldModule = keyof typeof CUSTOM_FIELD_MODULE_ACCESS;

export function isCustomFieldModule(value: string): value is CustomFieldModule {
  return Object.prototype.hasOwnProperty.call(CUSTOM_FIELD_MODULE_ACCESS, value);
}

export function customFieldPermissionModule(module: CustomFieldModule) {
  return CUSTOM_FIELD_MODULE_ACCESS[module];
}
