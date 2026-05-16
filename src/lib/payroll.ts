/**
 * 台灣薪資計算工具
 *
 * 預設費率（2024）：
 *  - 勞保費率 11% (員工自付 20%、雇主負擔 70%、政府 10%)
 *  - 健保費率 5.17% (員工自付 30%、雇主負擔 60%、政府 10%) + 眷屬上限3口
 *  - 勞退 6% (全部雇主負擔)
 *  - 員工自願提繳 (0-6%) 由員工薪資扣除
 *
 * 所得稅扣繳率採用 5% 簡化估算 (實際應依據各類所得扣繳率表)。
 */

export const PAYROLL_RATES = {
  LABOR_INSURANCE: 0.11,        // 勞保總費率
  LI_EMPLOYEE: 0.20,            // 員工負擔比例
  LI_EMPLOYER: 0.70,            // 雇主負擔比例
  NHI: 0.0517,                  // 健保費率
  NHI_EMPLOYEE: 0.30,           // 員工負擔比例
  NHI_EMPLOYER: 0.60,           // 雇主負擔比例
  LABOR_PENSION_DEFAULT: 0.06,  // 勞退預設雇主提繳率 6%
  WITHHOLDING_TAX: 0.05,        // 預扣所得稅 5% (估算)
  MEAL_TAX_FREE_LIMIT: 2400,    // 伙食津貼免稅上限
  SUPPLEMENTARY_NHI: 0.0211,    // 二代健保補充保費 (高額獎金)
  SUPP_NHI_THRESHOLD: 26400,    // 二代健保下限 (奬金超過月投保 4 倍開始課)
} as const;

export type PayrollInput = {
  baseSalary: number;
  mealAllowance: number;
  transportAllowance: number;
  positionAllowance: number;
  overtimePay: number;
  bonus: number;
  insuredSalary: number;        // 投保薪資
  dependents: number;
  laborPensionRate: number;     // 雇主勞退
  voluntaryPensionRate: number; // 員工自願提繳
  leaveDeduction?: number;      // 請假扣款
  otherDeductions?: number;
};

export type PayrollLine = {
  type: "EARNING" | "DEDUCTION" | "EMPLOYER";
  code: string;
  name: string;
  amount: number;
  taxable?: boolean;
};

export type PayrollCalc = {
  earnings: number;
  deductions: number;
  employerCost: number;
  netPay: number;
  taxableIncome: number;
  lines: PayrollLine[];
};

/** 計算單一員工薪資 */
export function computePayroll(input: PayrollInput): PayrollCalc {
  const lines: PayrollLine[] = [];

  // === 應發項目 (EARNING) ===
  const base = +input.baseSalary || 0;
  const meal = +input.mealAllowance || 0;
  const transport = +input.transportAllowance || 0;
  const positionA = +input.positionAllowance || 0;
  const ot = +input.overtimePay || 0;
  const bonus = +input.bonus || 0;

  if (base > 0) lines.push({ type: "EARNING", code: "BASE", name: "本薪", amount: base, taxable: true });
  if (positionA > 0) lines.push({ type: "EARNING", code: "POSITION", name: "職務加給", amount: positionA, taxable: true });
  if (transport > 0) lines.push({ type: "EARNING", code: "TRANSPORT", name: "交通津貼", amount: transport, taxable: true });
  if (meal > 0) {
    // 伙食津貼 2400 以下免稅
    const tax = meal > PAYROLL_RATES.MEAL_TAX_FREE_LIMIT ? meal - PAYROLL_RATES.MEAL_TAX_FREE_LIMIT : 0;
    lines.push({ type: "EARNING", code: "MEAL", name: "伙食津貼", amount: meal, taxable: tax > 0 });
  }
  if (ot > 0) lines.push({ type: "EARNING", code: "OT", name: "加班費", amount: ot, taxable: false });
  if (bonus > 0) lines.push({ type: "EARNING", code: "BONUS", name: "獎金", amount: bonus, taxable: true });

  const earnings = lines.filter((l) => l.type === "EARNING").reduce((s, l) => s + l.amount, 0);
  const taxableIncome = lines.filter((l) => l.type === "EARNING" && l.taxable).reduce((s, l) => s + l.amount, 0)
    - (meal > PAYROLL_RATES.MEAL_TAX_FREE_LIMIT ? PAYROLL_RATES.MEAL_TAX_FREE_LIMIT : meal); // 伙食免稅扣除

  // === 應扣項目 (DEDUCTION) ===
  const insuredSalary = +input.insuredSalary || base;

  // 勞保員工自付 = 投保薪資 × 11% × 20%
  const liEmployee = Math.round(insuredSalary * PAYROLL_RATES.LABOR_INSURANCE * PAYROLL_RATES.LI_EMPLOYEE);
  if (liEmployee > 0) lines.push({ type: "DEDUCTION", code: "LI", name: "勞保費(自付)", amount: liEmployee });

  // 健保員工自付 = 投保薪資 × 5.17% × 30% × (1 + 眷屬數最多3)
  const dep = Math.min(Math.max(0, input.dependents || 0), 3);
  const nhiEmployee = Math.round(insuredSalary * PAYROLL_RATES.NHI * PAYROLL_RATES.NHI_EMPLOYEE * (1 + dep));
  if (nhiEmployee > 0) lines.push({ type: "DEDUCTION", code: "NHI", name: "健保費(自付)", amount: nhiEmployee });

  // 員工自願提繳勞退
  const voluntaryRate = +input.voluntaryPensionRate || 0;
  const voluntaryPension = Math.round(insuredSalary * voluntaryRate);
  if (voluntaryPension > 0) lines.push({ type: "DEDUCTION", code: "PENSION_VOL", name: "勞退自提", amount: voluntaryPension });

  // 預扣所得稅 (簡化 5%)
  const tax = Math.round(taxableIncome * PAYROLL_RATES.WITHHOLDING_TAX);
  if (tax > 0) lines.push({ type: "DEDUCTION", code: "TAX", name: "代扣所得稅", amount: tax });

  // 請假扣款 / 其他扣款
  const leaveDeduction = Number(input.leaveDeduction ?? 0) || 0;
  if (leaveDeduction > 0) lines.push({ type: "DEDUCTION", code: "LEAVE_DEDUCT", name: "請假扣款", amount: leaveDeduction });
  const other = Number(input.otherDeductions ?? 0) || 0;
  if (other > 0) lines.push({ type: "DEDUCTION", code: "OTHER_DEDUCT", name: "其他扣款", amount: other });

  const deductions = lines.filter((l) => l.type === "DEDUCTION").reduce((s, l) => s + l.amount, 0);

  // === 雇主負擔 (EMPLOYER) - 不影響淨額 ===
  const liEmployer = Math.round(insuredSalary * PAYROLL_RATES.LABOR_INSURANCE * PAYROLL_RATES.LI_EMPLOYER);
  const nhiEmployer = Math.round(insuredSalary * PAYROLL_RATES.NHI * PAYROLL_RATES.NHI_EMPLOYER);
  const pensionEmployer = Math.round(insuredSalary * (+input.laborPensionRate || PAYROLL_RATES.LABOR_PENSION_DEFAULT));
  if (liEmployer > 0) lines.push({ type: "EMPLOYER", code: "LI_ER", name: "勞保(雇主)", amount: liEmployer });
  if (nhiEmployer > 0) lines.push({ type: "EMPLOYER", code: "NHI_ER", name: "健保(雇主)", amount: nhiEmployer });
  if (pensionEmployer > 0) lines.push({ type: "EMPLOYER", code: "PENSION_ER", name: "勞退提繳(雇主6%)", amount: pensionEmployer });

  const employerCost = lines.filter((l) => l.type === "EMPLOYER").reduce((s, l) => s + l.amount, 0);

  const netPay = earnings - deductions;

  return {
    earnings,
    deductions,
    employerCost,
    netPay,
    taxableIncome,
    lines,
  };
}
