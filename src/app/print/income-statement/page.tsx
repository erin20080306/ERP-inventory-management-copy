import "../print.css";
import { AutoPrint } from "../auto-print";
import { CompanyHeader } from "../CompanyHeader";
import { computeTrialBalance, periodLabel } from "@/lib/report-calc";
import { formatMoney } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function IncomeStatementPrint({
  searchParams,
}: {
  searchParams: { from?: string; to?: string };
}) {
  const today = new Date();
  const start = searchParams.from
    ? new Date(searchParams.from)
    : new Date(today.getFullYear(), 0, 1);
  const end = searchParams.to ? new Date(searchParams.to) : today;

  // 完整期間使用 trialBalance 截止 end
  const trial = await computeTrialBalance(end);

  const revenues = trial.filter((a) => a.type === "REVENUE");
  const costs = trial.filter((a) => a.type === "COST");
  const expenses = trial.filter((a) => a.type === "EXPENSE");

  const operatingRevenue = revenues
    .filter((a) => a.code.startsWith("41") || a.code.startsWith("42") || a.code.startsWith("43"))
    .reduce((s, a) => s + a.balance, 0);
  const otherRevenue = revenues
    .filter((a) => !(a.code.startsWith("41") || a.code.startsWith("42") || a.code.startsWith("43")))
    .reduce((s, a) => s + a.balance, 0);

  const totalCost = costs.reduce((s, a) => s + a.balance, 0);
  const grossProfit = operatingRevenue - totalCost;

  const operatingExpenses = expenses
    .filter((a) => a.code.startsWith("6"))
    .reduce((s, a) => s + a.balance, 0);
  const nonOperatingExpenses = expenses
    .filter((a) => a.code.startsWith("7") || a.code.startsWith("8") || a.code.startsWith("9"))
    .reduce((s, a) => s + a.balance, 0);

  const operatingIncome = grossProfit - operatingExpenses;
  const incomeBeforeTax = operatingIncome + otherRevenue - nonOperatingExpenses;
  const tax = expenses
    .filter((a) => a.code.startsWith("9") || a.name.includes("所得稅"))
    .reduce((s, a) => s + a.balance, 0);
  const netIncome = incomeBeforeTax - tax;

  const fmt = (n: number) => formatMoney(n).replace("NT$ ", "");

  type Row = { label: string; amount?: number; bold?: boolean; rule?: "none" | "single" | "double"; sub?: boolean };
  const rows: Row[] = [
    { label: "營業收入", bold: true },
    ...revenues
      .filter((a) => a.code.startsWith("41") || a.code.startsWith("42") || a.code.startsWith("43"))
      .map((a) => ({ label: `　${a.code} ${a.name}`, amount: a.balance, sub: true } as Row)),
    { label: "　營業收入合計", amount: operatingRevenue, rule: "single" },
    { label: "營業成本", bold: true },
    ...costs.map((a) => ({ label: `　${a.code} ${a.name}`, amount: a.balance, sub: true } as Row)),
    { label: "　營業成本合計", amount: totalCost, rule: "single" },
    { label: "營業毛利", amount: grossProfit, bold: true, rule: "single" },
    { label: "營業費用", bold: true },
    ...expenses
      .filter((a) => a.code.startsWith("6"))
      .map((a) => ({ label: `　${a.code} ${a.name}`, amount: a.balance, sub: true } as Row)),
    { label: "　營業費用合計", amount: operatingExpenses, rule: "single" },
    { label: "營業淨利", amount: operatingIncome, bold: true, rule: "single" },
    { label: "營業外收入", bold: true },
    ...revenues
      .filter((a) => !(a.code.startsWith("41") || a.code.startsWith("42") || a.code.startsWith("43")))
      .map((a) => ({ label: `　${a.code} ${a.name}`, amount: a.balance, sub: true } as Row)),
    { label: "　營業外收入合計", amount: otherRevenue, rule: "single" },
    { label: "營業外費用", bold: true },
    ...expenses
      .filter((a) => a.code.startsWith("7") || a.code.startsWith("8"))
      .map((a) => ({ label: `　${a.code} ${a.name}`, amount: a.balance, sub: true } as Row)),
    { label: "　營業外費用合計", amount: nonOperatingExpenses, rule: "single" },
    { label: "稅前淨利", amount: incomeBeforeTax, bold: true, rule: "single" },
    { label: "所得稅費用", amount: tax, sub: true },
    { label: "本期淨利", amount: netIncome, bold: true, rule: "double" },
  ];

  return (
    <>
      <AutoPrint />
      <div className="sheet">
        <CompanyHeader />
        <div className="doc-title">綜　合　損　益　表</div>
        <div className="doc-subtitle">{periodLabel(start, end)}</div>
        <div className="report-unit">單位：新台幣元</div>

        <table className="report-table">
          <thead>
            <tr>
              <th style={{ width: "70%", textAlign: "left" }}>項　目</th>
              <th style={{ width: "30%" }} className="num">金　額</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={i}
                className={[r.bold ? "bold-row" : "", r.rule === "single" ? "rule-single" : "", r.rule === "double" ? "rule-double" : "", r.sub ? "sub-row" : ""].join(" ")}
              >
                <td>{r.label}</td>
                <td className="num">{r.amount !== undefined ? fmt(r.amount) : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="signatures" style={{ gridTemplateColumns: "repeat(4, 1fr)", marginTop: 14 }}>
          <div className="sig-box" data-label="董事長"></div>
          <div className="sig-box" data-label="總經理"></div>
          <div className="sig-box" data-label="會計主管"></div>
          <div className="sig-box" data-label="製表"></div>
        </div>

        <div className="footer-note">
          備註：本表依一般公認會計原則編製。 列印日期：{new Date().toLocaleString("zh-TW")}
        </div>
      </div>
    </>
  );
}
