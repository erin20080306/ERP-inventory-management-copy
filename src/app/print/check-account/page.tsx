import "../print.css";
import { AutoPrint } from "../auto-print";
import { CompanyHeader } from "../CompanyHeader";
import { computeTrialBalance, periodLabel } from "@/lib/report-calc";
import { formatMoney } from "@/lib/utils";
import { requireTenantId } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function CheckAccountPrint({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const query = await searchParams;
  const today = new Date();
  const start = query.from
    ? new Date(query.from)
    : new Date(today.getFullYear(), 0, 1);
  const end = query.to ? new Date(query.to) : today;

  const tenantId = await requireTenantId();
  const trial = await computeTrialBalance(end, tenantId);

  // 篩選支票存款科目 (1106)
  const checkAccount = trial.find((a) => a.code === "1106");
  
  if (!checkAccount) {
    return (
      <div className="sheet">
        <CompanyHeader />
        <div className="doc-title">支票帳戶報表</div>
        <div className="doc-subtitle">找不到支票存款科目 (1106)</div>
      </div>
    );
  }

  // 詳細明細需要查詢傳票行
  const { prisma } = await import("@/lib/prisma");
  const journalLines = await prisma.journalEntryLine.findMany({
    where: {
      account: { code: "1106", tenantId },
      entry: { status: "POSTED", entryDate: { gte: start, lte: end } },
    },
    include: {
      entry: {
        select: {
          number: true,
          summary: true,
          entryDate: true,
        },
      },
    },
    orderBy: { entry: { entryDate: "asc" } },
  });

  const fmt = (n: number) => (n === 0 ? "—" : formatMoney(n).replace("NT$ ", ""));

  return (
    <>
      <AutoPrint />
      <div className="sheet">
        <CompanyHeader />
        <div className="doc-title">支票帳戶報表</div>
        <div className="doc-subtitle">{periodLabel(start, end)}</div>
        <div className="report-unit">單位：新台幣元</div>

        <table className="report-table">
          <thead>
            <tr>
              <th style={{ width: "15%" }}>日期</th>
              <th style={{ width: "15%" }}>傳票號碼</th>
              <th style={{ width: "40%", textAlign: "left" }}>摘要</th>
              <th style={{ width: "15%" }} className="num">借方</th>
              <th style={{ width: "15%" }} className="num">貸方</th>
            </tr>
          </thead>
          <tbody>
            <tr className="subtotal">
              <td colSpan={2}>期初餘額</td>
              <td></td>
              <td className="num">{fmt(checkAccount.openingBalance)}</td>
              <td></td>
            </tr>
            {journalLines.map((line) => (
              <tr key={line.id}>
                <td>{line.entry.entryDate.toISOString().slice(0, 10)}</td>
                <td>{line.entry.number}</td>
                <td>{line.entry.summary}</td>
                <td className="num">{fmt(Number(line.debit))}</td>
                <td className="num">{fmt(Number(line.credit))}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="total">
              <td colSpan={3}>期末餘額</td>
              <td className="num">{fmt(checkAccount.balance)}</td>
              <td></td>
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
          備註：本表顯示支票帳戶的詳細交易明細。 列印日期：{new Date().toLocaleString("zh-TW")}
        </div>
      </div>
    </>
  );
}
