import "../print.css";
import { AutoPrint } from "../auto-print";
import { CompanyHeader } from "../CompanyHeader";
import { computeTrialBalance, periodLabel } from "@/lib/report-calc";
import { formatMoney } from "@/lib/utils";
import { requireTenantId } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function CurrentAccountPrint({
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

  // 篩選活期帳戶科目 (1103 銀行存款 或 1111 銀行存款-活期)
  const currentAccounts = trial.filter((a) => a.code === "1103" || a.code === "1111");
  
  if (currentAccounts.length === 0) {
    return (
      <div className="sheet">
        <CompanyHeader />
        <div className="doc-title">活期帳戶報表</div>
        <div className="doc-subtitle">找不到活期帳戶科目 (1103 或 1111)</div>
      </div>
    );
  }

  // 詳細明細需要查詢傳票行
  const { prisma } = await import("@/lib/prisma");
  const accountCodes = currentAccounts.map(a => a.code);
  const journalLines = await prisma.journalEntryLine.findMany({
    where: {
      account: { code: { in: accountCodes }, tenantId },
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
      account: {
        select: {
          code: true,
          name: true,
        },
      },
    },
    orderBy: { entry: { entryDate: "asc" } },
  });

  const fmt = (n: number) => (n === 0 ? "—" : formatMoney(n).replace("NT$ ", ""));

  // 按科目分組
  const byAccount = new Map<string, any[]>();
  for (const line of journalLines) {
    const key = line.account.code;
    if (!byAccount.has(key)) {
      byAccount.set(key, []);
    }
    byAccount.get(key)!.push(line);
  }

  return (
    <>
      <AutoPrint />
      <div className="sheet">
        <CompanyHeader />
        <div className="doc-title">活期帳戶報表</div>
        <div className="doc-subtitle">{periodLabel(start, end)}</div>
        <div className="report-unit">單位：新台幣元</div>

        {currentAccounts.map((account) => {
          const lines = byAccount.get(account.code) || [];
          const totalDebit = lines.reduce((s, l) => s + Number(l.debit), 0);
          const totalCredit = lines.reduce((s, l) => s + Number(l.credit), 0);

          return (
            <div key={account.code} style={{ marginBottom: 30 }}>
              <h3 style={{ fontSize: 16, fontWeight: "bold", marginBottom: 10 }}>
                {account.code} {account.name}
              </h3>
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
                    <td className="num">{fmt(account.openingBalance)}</td>
                    <td></td>
                  </tr>
                  {lines.map((line) => (
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
                    <td colSpan={3}>本期合計</td>
                    <td className="num">{fmt(totalDebit)}</td>
                    <td className="num">{fmt(totalCredit)}</td>
                  </tr>
                  <tr className="total">
                    <td colSpan={3}>期末餘額</td>
                    <td className="num">{fmt(account.balance)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          );
        })}

        <div className="signatures" style={{ gridTemplateColumns: "repeat(4, 1fr)", marginTop: 14 }}>
          <div className="sig-box" data-label="董事長"></div>
          <div className="sig-box" data-label="總經理"></div>
          <div className="sig-box" data-label="會計主管"></div>
          <div className="sig-box" data-label="製表"></div>
        </div>

        <div className="footer-note">
          備註：本表顯示活期帳戶的詳細交易明細。 列印日期：{new Date().toLocaleString("zh-TW")}
        </div>
      </div>
    </>
  );
}
