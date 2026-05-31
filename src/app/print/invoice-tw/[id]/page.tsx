import { prisma } from "@/lib/prisma";
import { requirePermission, requireTenantId } from "@/lib/api";
import { notFound } from "next/navigation";
import { AutoPrint } from "../../auto-print";
import { formatDate, formatMoney } from "@/lib/utils";
import { roundInvoiceAmount } from "@/lib/invoice-totals";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: { id: string } }) {
  await requirePermission("invoices.view");
  const tenantId = await requireTenantId();
  const inv = await prisma.invoice.findUnique({
    where: { id: params.id },
    include: { customer: true, supplier: true, items: true },
  });
  if (!inv || inv.tenantId !== tenantId) notFound();

  const company = await prisma.companySetting.findFirst({ where: { tenantId } });
  const party = inv.customer ?? inv.supplier;
  const isSales = inv.type === "SALES";
  const copies = isSales ? (party?.taxId ? "三聯式" : "二聯式") : "進項";

  // 民國年
  const d = new Date(inv.invoiceDate);
  const rocYear = d.getFullYear() - 1911;
  const rocDate = `${rocYear}年${String(d.getMonth() + 1).padStart(2, "0")}月${String(d.getDate()).padStart(2, "0")}日`;

  return (
    <>
      <AutoPrint />
      <div className="tw-invoice-sheet">
        {/* 發票頭 */}
        <div className="tw-inv-header">
          <div className="tw-inv-seller">
            <div className="tw-inv-company">{company?.name ?? "公司名稱"}</div>
            <div className="tw-inv-small">
              {company?.taxId && <div>統一編號：{company.taxId}</div>}
              {company?.address && <div>地址：{company.address}</div>}
              {company?.phone && <div>電話：{company.phone}</div>}
            </div>
          </div>
          <div className="tw-inv-title-block">
            <div className="tw-inv-title">電 子 發 票 證 明 聯</div>
            <div className="tw-inv-subtitle">{copies}{isSales ? "發票" : "發票"}</div>
            <div className="tw-inv-period">中華民國 {rocDate}</div>
          </div>
          <div className="tw-inv-number-block">
            <div className="tw-inv-number">{inv.number}</div>
            <div className="tw-inv-small">格式：25</div>
          </div>
        </div>

        {/* 買受人資訊 */}
        <div className="tw-inv-buyer">
          <table className="tw-inv-info-table">
            <tbody>
              <tr>
                <td className="tw-inv-label">買受人</td>
                <td>{party?.companyName ?? "—"}</td>
                <td className="tw-inv-label">統一編號</td>
                <td>{party?.taxId ?? "—"}</td>
              </tr>
              <tr>
                <td className="tw-inv-label">地　址</td>
                <td colSpan={3}>{party?.address ?? "—"}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* 明細 */}
        <table className="tw-inv-items">
          <thead>
            <tr>
              <th style={{ width: 35 }}>序</th>
              <th>品名規格</th>
              <th style={{ width: 60 }}>數量</th>
              <th style={{ width: 80 }}>單價</th>
              <th style={{ width: 80 }}>金額</th>
              <th style={{ width: 50 }}>備註</th>
            </tr>
          </thead>
          <tbody>
            {inv.items.map((item: any, idx: number) => (
              <tr key={item.id}>
                <td className="center">{idx + 1}</td>
                <td>{item.description}</td>
                <td className="num">{Number(item.quantity)}</td>
                <td className="num">{Number(item.unitPrice).toLocaleString()}</td>
                <td className="num">{Number(item.subtotal).toLocaleString()}</td>
                <td></td>
              </tr>
            ))}
            {Array.from({ length: Math.max(0, 8 - inv.items.length) }).map((_, i) => (
              <tr key={`e${i}`}><td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td></tr>
            ))}
          </tbody>
        </table>

        {/* 合計 */}
        <div className="tw-inv-totals">
          <div className="tw-inv-total-row">
            <span className="tw-inv-label">銷售額合計</span>
            <span className="tw-inv-total-amt">{Number(inv.amountExTax).toLocaleString()}</span>
          </div>
          <div className="tw-inv-total-row">
            <span className="tw-inv-label">營 業 稅</span>
            <span className="tw-inv-total-amt">{roundInvoiceAmount(inv.taxAmount).toLocaleString()}</span>
          </div>
          <div className="tw-inv-total-row tw-inv-grand">
            <span className="tw-inv-label">總　計</span>
            <span className="tw-inv-total-amt">{roundInvoiceAmount(inv.totalAmount).toLocaleString()}</span>
          </div>
        </div>

        {/* 底部 */}
        <div className="tw-inv-footer">
          <div className="tw-inv-remark">備註：{inv.remark ?? ""}</div>
          <div className="tw-inv-print-time">列印時間：{new Date().toLocaleString("zh-TW")}</div>
        </div>
      </div>
    </>
  );
}
