import "../print.css";
import { AutoPrint } from "../auto-print";
import { CompanyHeader } from "../CompanyHeader";
import { computeTrialBalance, asOfLabel } from "@/lib/report-calc";
import { formatMoney } from "@/lib/utils";
import { requireTenantId } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function TrialBalancePrint({
  searchParams,
}: {
  searchParams: { date?: string };
}) {
  const tenantId = await requireTenantId();
  const asOf = searchParams.date ? new Date(searchParams.date) : new Date();
  const trial = await computeTrialBalance(asOf, tenantId);

  const sumOpening = trial.reduce((s, a) => s + a.openingBalance, 0);
  const sumDebit = trial.reduce((s, a) => s + a.totalDebit, 0);
  const sumCredit = trial.reduce((s, a) => s + a.totalCredit, 0);
  const sumBalance = trial.reduce((s, a) => s + a.balance, 0);

  const typeLabel: Record<string, string> = {
    ASSET: "資產", LIABILITY: "負債", EQUITY: "權益",
    REVENUE: "收入", COST: "成本", EXPENSE: "費用",
  };

  const fmt = (n: number) => (n === 0 ? "—" : formatMoney(n).replace("NT$ ", ""));

  return (
    <>
      <AutoPrint />
      <div className="sheet">
        <CompanyHeader />
        <div className="doc-title">試　算　表</div>
        <div className="doc-subtitle">{asOfLabel(asOf)}</div>
        <div className="report-unit">單位：新台幣元</div>

        <table className="report-table">
          <thead>
            <tr>
              <th style={{ width: "10%" }}>科目編號</th>
              <th style={{ width: "26%", textAlign: "left" }}>會計科目</th>
              <th style={{ width: "8%" }}>類型</th>
              <th style={{ width: "14%" }} className="num">期初餘額</th>
              <th style={{ width: "14%" }} className="num">本期借方</th>
              <th style={{ width: "14%" }} className="num">本期貸方</th>
              <th style={{ width: "14%" }} className="num">期末餘額</th>
            </tr>
          </thead>
          <tbody>
            {trial.map((a) => (
              <tr key={a.id}>
                <td className="font-mono" style={{ fontSize: 11 }}>{a.code}</td>
                <td>{a.name}</td>
                <td style={{ textAlign: "center" }}>{typeLabel[a.type]}</td>
                <td className="num">{fmt(a.openingBalance)}</td>
                <td className="num">{fmt(a.totalDebit)}</td>
                <td className="num">{fmt(a.totalCredit)}</td>
                <td className="num bold">{fmt(a.balance)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="total">
              <td colSpan={3}>合　計</td>
              <td className="num">{fmt(sumOpening)}</td>
              <td className="num">{fmt(sumDebit)}</td>
              <td className="num">{fmt(sumCredit)}</td>
              <td className="num">{fmt(sumBalance)}</td>
            </tr>
          </tfoot>
        </table>

        <div className="signatures" style={{ gridTemplateColumns: "repeat(4, 1fr)", marginTop: 14 }}>
          <div className="sig-box" data-label="董事長"></div>
          <div className="sig-box" data-label="總經理"></div>
          <div className="sig-box" data-label="會計主管"></div>
          <div className="sig-box" data-label="製表"></div>
        </div>

        <div className="footer-note">
          備註：借方合計與貸方合計應相等以驗證帳目平衡。 列印日期：{new Date().toLocaleString("zh-TW")}
        </div>
      </div>
    </>
  );
}
