/**
 * 標準會計科目的英文對照（依科目代碼查，不依中文名稱）。
 *
 * 設計原則，與 Odoo 的在地化套件一致：
 *  - 科目「代碼」是語言中立的主鍵，資料庫存的中文名稱維持不變，既有租戶不受影響。
 *  - 英文模式只在「顯示」時替換名稱；傳票、報表與勾稽仍以代碼與金額為準。
 *  - 租戶自建的科目（不在此表內）永遠顯示使用者自己輸入的名稱，不會被誤譯。
 *
 * 名稱採 IFRS／一般美國公認會計原則常見用語，方便外籍主管與會計師閱讀；
 * 這是閱讀輔助，不等於法定英文財報格式。
 */
export const ACCOUNT_NAME_EN: Record<string, string> = {
  // 流動資產
  "1101": "Cash on Hand",
  "1102": "Petty Cash",
  "1103": "Bank Deposits",
  "1104": "Time Deposits",
  "1105": "Foreign Currency Deposits",
  "1111": "Short-term Investments",
  "1131": "Notes Receivable",
  "1132": "Accounts Receivable",
  "1133": "Accounts Receivable — Related Parties",
  "1134": "Other Receivables",
  "1141": "Allowance for Doubtful Accounts",
  "1151": "Input Tax",
  "1152": "Prepaid Taxes",
  "1161": "Prepayments",
  "1162": "Prepaid Salaries",
  "1163": "Prepaid Rent",
  "1164": "Prepaid Insurance",
  "1201": "Inventory",
  "1202": "Work in Process",
  "1203": "Raw Materials",
  // 長期投資與固定資產
  "1301": "Long-term Investments",
  "1401": "Land",
  "1411": "Buildings and Structures",
  "1421": "Machinery and Equipment",
  "1431": "Transportation Equipment",
  "1441": "Office Equipment",
  "1442": "Computers and Peripherals",
  "1451": "Accumulated Depreciation — Buildings",
  "1452": "Accumulated Depreciation — Machinery",
  "1453": "Accumulated Depreciation — Transportation Equipment",
  "1454": "Accumulated Depreciation — Office Equipment",
  "1455": "Accumulated Depreciation — Computer Equipment",
  "1501": "Intangible Assets",
  "1502": "Goodwill",
  "1503": "Computer Software",
  "1601": "Refundable Deposits Paid",
  // 流動負債
  "2101": "Short-term Borrowings",
  "2102": "Notes Payable",
  "2103": "Accounts Payable",
  "2104": "Salaries Payable",
  "2105": "Accrued Expenses",
  "2106": "Commissions Payable",
  "2111": "Output Tax",
  "2112": "Business Tax Payable",
  "2113": "Income Tax Withheld",
  "2114": "Labor and Health Insurance Withheld",
  "2121": "Advance Receipts",
  "2131": "Other Payables",
  // 長期負債
  "2201": "Long-term Borrowings",
  "2202": "Corporate Bonds Payable",
  "2301": "Guarantee Deposits Received",
  // 權益
  "3101": "Capital",
  "3201": "Capital Surplus",
  "3301": "Legal Reserve",
  "3302": "Special Reserve",
  "3401": "Retained Earnings (Accumulated Deficit)",
  "3402": "Net Income for the Period",
  // 收入
  "4101": "Sales Revenue",
  "4102": "Sales Returns",
  "4103": "Sales Allowances",
  "4111": "Revenue from Labor Services",
  "4112": "Service Revenue",
  "4113": "Commission Revenue",
  "4201": "Interest Income",
  "4202": "Investment Income",
  "4203": "Foreign Exchange Gains",
  "4204": "Gain on Disposal of Assets",
  "4205": "Other Income",
  // 成本
  "5101": "Cost of Goods Sold",
  "5102": "Purchases",
  "5103": "Inbound Freight",
  "5104": "Purchase Returns",
  "5105": "Purchase Allowances",
  "5201": "Cost of Labor Services",
  "5202": "Cost of Services",
  "5301": "Manufacturing Overhead",
  // 費用
  "6101": "Salaries and Wages",
  "6102": "Overtime Pay",
  "6103": "Bonuses",
  "6104": "Labor and Health Insurance",
  "6105": "Pension Expense",
  "6106": "Employee Benefits",
  "6111": "Rent Expense",
  "6112": "Office Supplies",
  "6113": "Travel Expense",
  "6114": "Freight Out",
  "6115": "Postage and Telecommunications",
  "6116": "Repairs and Maintenance",
  "6117": "Advertising Expense",
  "6118": "Utilities",
  "6119": "Insurance Expense",
  "6120": "Commission Expense",
  "6121": "Entertainment Expense",
  "6122": "Donations",
  "6123": "Taxes and Duties",
  "6124": "Depreciation Expense",
  "6125": "Amortization Expense",
  "6126": "Training Expense",
  "6127": "Sundry Purchases",
  "6128": "Books and Periodicals",
  "6129": "Professional Service Fees",
  "6130": "Other Expenses",
  "6201": "Interest Expense",
  "6202": "Foreign Exchange Losses",
  "6203": "Loss on Disposal of Assets",
  "6204": "Investment Losses",
  "6301": "Income Tax Expense",
};

/** 六大科目類別的英文對照。 */
export const ACCOUNT_TYPE_EN: Record<string, string> = {
  ASSET: "Assets",
  LIABILITY: "Liabilities",
  EQUITY: "Equity",
  REVENUE: "Revenue",
  COST: "Cost of Sales",
  EXPENSE: "Expenses",
};

/**
 * 取得科目顯示名稱。
 * 只有「標準科目 + 英文介面」才替換；自訂科目與中文介面一律回傳資料庫原名。
 */
export function accountDisplayName(locale: string, code: string | null | undefined, storedName: string) {
  if (!locale.startsWith("en") || !code) return storedName;
  return ACCOUNT_NAME_EN[code.trim()] ?? storedName;
}
