import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/api";
import { notFound } from "next/navigation";
import { AutoPrint } from "../../auto-print";
import { CompanyHeader } from "../../CompanyHeader";
import { formatDate, formatMoney } from "@/lib/utils";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "草稿", CONFIRMED: "已確認", SHIPPED: "已出貨", INVOICED: "已開立發票", PAID: "已收款", CANCELLED: "已取消",
};

export default async function Page({ params }: { params: { id: string } }) {
  await requirePermission("sales.view");
  const o = await prisma.salesOrder.findUnique({
    where: { id: params.id },
    include: { customer: true, items: { include: { product: true } } },
  });
  if (!o) notFound();
  return (
    <>
      <AutoPrint />
      <div className="sheet">
        <CompanyHeader />
        <div className="doc-title">銷　貨　單</div>
        <div className="meta">
          <div><span className="label">單　　號：</span>{o.number}</div>
          <div><span className="label">日　　期：</span>{formatDate(o.orderDate)}</div>
          <div><span className="label">客　　戶：</span>{o.customer.companyName}</div>
          <div><span className="label">統一編號：</span>{o.customer.taxId ?? "—"}</div>
          <div><span className="label">聯 絡 人：</span>{o.customer.contactName ?? "—"}</div>
          <div><span className="label">狀　　態：</span>{STATUS_LABEL[o.status] ?? o.status}</div>
        </div>
        <table className="doc-table">
          <thead>
            <tr>
              <th style={{ width: 40 }}>#</th>
              <th style={{ width: 100 }}>SKU</th>
              <th>品名規格</th>
              <th style={{ width: 70 }} className="num">數量</th>
              <th style={{ width: 90 }} className="num">單價</th>
              <th style={{ width: 70 }} className="num">折扣</th>
              <th style={{ width: 110 }} className="num">小計</th>
            </tr>
          </thead>
          <tbody>
            {o.items.map((i: any, idx: number) => (
              <tr key={i.id}>
                <td style={{ textAlign: "center" }}>{idx + 1}</td>
                <td>{i.product.sku}</td>
                <td>{i.product.name}{i.product.spec ? `（${i.product.spec}）` : ""}</td>
                <td className="num">{Number(i.quantity)}</td>
                <td className="num">{formatMoney(i.unitPrice).replace("NT$ ", "")}</td>
                <td className="num">{Number(i.discount) ? formatMoney(i.discount).replace("NT$ ", "") : ""}</td>
                <td className="num">{formatMoney(i.subtotal).replace("NT$ ", "")}</td>
              </tr>
            ))}
            {Array.from({ length: Math.max(0, 6 - o.items.length) }).map((_, i) => (
              <tr key={`e${i}`}><td>&nbsp;</td><td></td><td></td><td className="num"></td><td className="num"></td><td className="num"></td><td className="num"></td></tr>
            ))}
          </tbody>
        </table>
        <div className="totals">
          <div className="remark-box"><span className="label">備註：</span>{o.remark ?? ""}</div>
          <div className="summary">
            <div>小　計</div><div>{formatMoney(o.subtotal).replace("NT$ ", "")}</div>
            <div>折　扣</div><div>{formatMoney(o.discount).replace("NT$ ", "")}</div>
            <div>稅　額</div><div>{formatMoney(o.taxAmount).replace("NT$ ", "")}</div>
            <div className="row-total">總　計</div><div className="row-total">{formatMoney(o.total).replace("NT$ ", "")}</div>
          </div>
        </div>
        <div className="signatures">
          <div className="sig-box" data-label="業務人員"></div>
          <div className="sig-box" data-label="主　管"></div>
          <div className="sig-box" data-label="會　計"></div>
          <div className="sig-box" data-label="客戶簽收"></div>
        </div>
        <div className="footer-note">列印時間：{new Date().toLocaleString("zh-TW")}</div>
      </div>
    </>
  );
}
