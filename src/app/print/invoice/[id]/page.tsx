import { prisma } from "@/lib/prisma";
import { requirePermission, requireTenantId } from "@/lib/api";
import { notFound } from "next/navigation";
import { AutoPrint } from "../../auto-print";
import { CompanyHeader } from "../../CompanyHeader";
import { formatDate, formatMoney } from "@/lib/utils";
import { roundInvoiceAmount } from "@/lib/invoice-totals";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("invoices.view");
  const [{ id }, tenantId] = await Promise.all([params, requireTenantId()]);
  const inv = await prisma.invoice.findFirst({
    where: { id, tenantId },
    include: { customer: true, supplier: true, items: true },
  });
  if (!inv) notFound();
  const party = inv.customer ?? inv.supplier;
  const title = inv.type === "SALES" ? "銷 項 發 票" : "進 項 發 票";
  return (
    <>
      <AutoPrint />
      <div className="sheet">
        <CompanyHeader />
        <div className="doc-title">{title}</div>
        <div className="meta">
          <div><span className="label">發票號碼：</span>{inv.number}</div>
          <div><span className="label">發票日期：</span>{formatDate(inv.invoiceDate)}</div>
          <div><span className="label">{inv.type === "SALES" ? "買受人" : "賣方"}：</span>{party?.companyName ?? "—"}</div>
          <div><span className="label">統一編號：</span>{party?.taxId ?? "—"}</div>
          <div><span className="label">地　　址：</span>{party?.address ?? "—"}</div>
          <div><span className="label">狀　　態：</span>{inv.status === "POSTED" ? "已過帳" : inv.status === "VOIDED" ? "已作廢" : inv.status}</div>
        </div>
        <table className="doc-table">
          <thead>
            <tr>
              <th style={{ width: 40 }}>#</th>
              <th>品名</th>
              <th style={{ width: 70 }} className="num">數量</th>
              <th style={{ width: 100 }} className="num">單價</th>
              <th style={{ width: 80 }} className="num">稅率</th>
              <th style={{ width: 120 }} className="num">小計</th>
            </tr>
          </thead>
          <tbody>
            {inv.items.map((i: any, idx: number) => (
              <tr key={i.id}>
                <td style={{ textAlign: "center" }}>{idx + 1}</td>
                <td>{i.description}</td>
                <td className="num">{Number(i.quantity)}</td>
                <td className="num">{formatMoney(i.unitPrice).replace("NT$ ", "")}</td>
                <td className="num">{(Number(i.taxRate) * 100).toFixed(0)}%</td>
                <td className="num">{formatMoney(i.subtotal).replace("NT$ ", "")}</td>
              </tr>
            ))}
            {Array.from({ length: Math.max(0, 5 - inv.items.length) }).map((_, i) => (
              <tr key={`e${i}`}><td>&nbsp;</td><td></td><td className="num"></td><td className="num"></td><td className="num"></td><td className="num"></td></tr>
            ))}
          </tbody>
        </table>
        <div className="totals">
          <div className="remark-box"><span className="label">備註：</span>{inv.remark ?? ""}</div>
          <div className="summary">
            <div>銷售額（未稅）</div><div>{formatMoney(inv.amountExTax).replace("NT$ ", "")}</div>
            <div>營 業 稅 額</div><div>{formatMoney(roundInvoiceAmount(inv.taxAmount)).replace("NT$ ", "")}</div>
            <div className="row-total">總　計</div><div className="row-total">{formatMoney(roundInvoiceAmount(inv.totalAmount)).replace("NT$ ", "")}</div>
          </div>
        </div>
        <div className="footer-note">列印時間：{new Date().toLocaleString("zh-TW")}</div>
      </div>
    </>
  );
}
