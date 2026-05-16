import "../print.css";
import { AutoPrint } from "../auto-print";
import { CompanyHeader } from "../CompanyHeader";
import { computeTrialBalance, asOfLabel } from "@/lib/report-calc";
import { formatMoney } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function BalanceSheetPrint({
  searchParams,
}: {
  searchParams: { date?: string };
}) {
  const asOf = searchParams.date ? new Date(searchParams.date) : new Date();
  const trial = await computeTrialBalance(asOf);

  // 損益用於計算保留盈餘
  const revenue = trial.filter((a) => a.type === "REVENUE").reduce((s, a) => s + a.balance, 0);
  const cost = trial.filter((a) => a.type === "COST").reduce((s, a) => s + a.balance, 0);
  const expense = trial.filter((a) => a.type === "EXPENSE").reduce((s, a) => s + a.balance, 0);
  const netIncome = revenue - cost - expense;

  // 細分群組 (依代碼前綴)
  const assets = trial.filter((a) => a.type === "ASSET");
  const liabilities = trial.filter((a) => a.type === "LIABILITY");
  const equities = trial.filter((a) => a.type === "EQUITY");

  const currentAssets = assets.filter((a) => a.code.startsWith("11") || a.code.startsWith("12") || a.code.startsWith("13") || a.code.startsWith("14"));
  const fixedAssets = assets.filter((a) => a.code.startsWith("15") || a.code.startsWith("16") || a.code.startsWith("17") || a.code.startsWith("18") || a.code.startsWith("19"));

  const currentLiabilities = liabilities.filter((a) => a.code.startsWith("21") || a.code.startsWith("22") || a.code.startsWith("23") || a.code.startsWith("24") || a.code.startsWith("25"));
  const longTermLiabilities = liabilities.filter((a) => a.code.startsWith("28") || a.code.startsWith("29"));

  const totalCurrentAssets = currentAssets.reduce((s, a) => s + a.balance, 0);
  const totalFixedAssets = fixedAssets.reduce((s, a) => s + a.balance, 0);
  const totalAssets = totalCurrentAssets + totalFixedAssets;

  const totalCurrentLiab = currentLiabilities.reduce((s, a) => s + a.balance, 0);
  const totalLongTermLiab = longTermLiabilities.reduce((s, a) => s + a.balance, 0);
  const totalLiabilities = totalCurrentLiab + totalLongTermLiab;

  const totalEquity = equities.reduce((s, a) => s + a.balance, 0) + netIncome;
  const totalLiabAndEquity = totalLiabilities + totalEquity;

  const fmt = (n: number) => formatMoney(n).replace("NT$ ", "");

  const Line = ({ a }: { a: any }) => (
    <tr>
      <td className="indent">{a.code} {a.name}</td>
      <td className="num">{a.balance !== 0 ? fmt(a.balance) : "—"}</td>
    </tr>
  );

  const SubTotal = ({ label, value }: { label: string; value: number }) => (
    <tr className="subtotal">
      <td>{label}</td>
      <td className="num">{fmt(value)}</td>
    </tr>
  );

  return (
    <>
      <AutoPrint />
      <div className="sheet">
        <CompanyHeader />
        <div className="doc-title">資　產　負　債　表</div>
        <div className="doc-subtitle">{asOfLabel(asOf)}</div>
        <div className="report-unit">單位：新台幣元</div>

        <div className="bs-grid">
          {/* 左：資產 */}
          <table className="report-table">
            <thead>
              <tr><th colSpan={2}>資　　產</th></tr>
            </thead>
            <tbody>
              <tr className="section"><td colSpan={2}>流動資產</td></tr>
              {currentAssets.map((a) => <Line key={a.id} a={a} />)}
              <SubTotal label="　流動資產合計" value={totalCurrentAssets} />

              <tr className="section"><td colSpan={2}>非流動資產</td></tr>
              {fixedAssets.map((a) => <Line key={a.id} a={a} />)}
              <SubTotal label="　非流動資產合計" value={totalFixedAssets} />
            </tbody>
            <tfoot>
              <tr className="total">
                <td>資　產　總　計</td>
                <td className="num">{fmt(totalAssets)}</td>
              </tr>
            </tfoot>
          </table>

          {/* 右：負債及權益 */}
          <table className="report-table">
            <thead>
              <tr><th colSpan={2}>負債及權益</th></tr>
            </thead>
            <tbody>
              <tr className="section"><td colSpan={2}>流動負債</td></tr>
              {currentLiabilities.map((a) => <Line key={a.id} a={a} />)}
              <SubTotal label="　流動負債合計" value={totalCurrentLiab} />

              <tr className="section"><td colSpan={2}>非流動負債</td></tr>
              {longTermLiabilities.map((a) => <Line key={a.id} a={a} />)}
              <SubTotal label="　非流動負債合計" value={totalLongTermLiab} />

              <SubTotal label="負債合計" value={totalLiabilities} />

              <tr className="section"><td colSpan={2}>權益</td></tr>
              {equities.map((a) => <Line key={a.id} a={a} />)}
              <tr>
                <td className="indent">本期損益</td>
                <td className="num">{fmt(netIncome)}</td>
              </tr>
              <SubTotal label="　權益合計" value={totalEquity} />
            </tbody>
            <tfoot>
              <tr className="total">
                <td>負債及權益總計</td>
                <td className="num">{fmt(totalLiabAndEquity)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

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
