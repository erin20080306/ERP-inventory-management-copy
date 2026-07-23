import { notFound } from "next/navigation";
import { AutoPrint } from "../../auto-print";
import { requirePermission, requireTenantId } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const PAYMENT_LABELS: Record<string, string> = {
  CASH: "現金",
  CARD: "信用卡",
  MOBILE: "行動支付",
  TRANSFER: "轉帳",
};

function money(value: unknown) {
  return `NT$ ${Number(value ?? 0).toLocaleString("zh-TW", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export default async function PosReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ print?: string }>;
}) {
  const session = await requirePermission("sales.view");
  const [{ id }, query, tenantId] = await Promise.all([params, searchParams, requireTenantId(session)]);
  const [sale, company] = await Promise.all([
    prisma.posSale.findFirst({
      where: { id, tenantId },
      include: {
        register: { include: { warehouse: true } },
        customer: true,
        items: { include: { product: true }, orderBy: { id: "asc" } },
        payments: { orderBy: { createdAt: "asc" } },
        refunds: { where: { status: "COMPLETED" }, select: { total: true } },
        electronicInvoice: true,
      },
    }),
    prisma.companySetting.findFirst({ where: { tenantId } }),
  ]);
  if (!sale) notFound();
  const refunded = sale.refunds.reduce((sum, refund) => sum + Number(refund.total), 0);

  return (
    <>
      <AutoPrint auto={query.print === "1"} />
      <article className="pos-receipt">
        <header className="pos-receipt-header">
          <h1>{company?.name || "門市交易明細"}</h1>
          {company?.taxId && <div>統一編號：{company.taxId}</div>}
          {company?.address && <div>{company.address}</div>}
          {company?.phone && <div>電話：{company.phone}</div>}
        </header>

        <div className="pos-receipt-warning">
          {!sale.electronicInvoice
            ? "交易收據／非電子發票證明聯"
            : sale.electronicInvoice.provider === "MOCK"
              ? "測試電子發票／不可報稅、不可兌獎"
              : sale.electronicInvoice.status === "ISSUED"
                ? "電子發票交易資訊"
                : `電子發票尚未完成（${sale.electronicInvoice.status}）`}
        </div>
        <dl className="pos-receipt-meta">
          <div><dt>交易單號</dt><dd>{sale.number}</dd></div>
          <div><dt>交易時間</dt><dd>{sale.createdAt.toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}</dd></div>
          <div><dt>門市／收銀台</dt><dd>{sale.register.warehouse.name}／{sale.register.name}</dd></div>
          <div><dt>收銀員</dt><dd>{session.user.name || session.user.username}</dd></div>
          <div><dt>客戶</dt><dd>{sale.customer?.companyName || "門市散客"}</dd></div>
          {sale.customer?.taxId && <div><dt>買方統編</dt><dd>{sale.customer.taxId}</dd></div>}
          {sale.electronicInvoice?.invoiceNumber && <div><dt>{sale.electronicInvoice.provider === "MOCK" ? "測試發票號碼" : "發票號碼"}</dt><dd>{sale.electronicInvoice.invoiceNumber}</dd></div>}
          {sale.electronicInvoice?.carrierId && <div><dt>載具</dt><dd>{sale.electronicInvoice.carrierId}</dd></div>}
          {sale.electronicInvoice?.donationCode && <div><dt>捐贈碼</dt><dd>{sale.electronicInvoice.donationCode}</dd></div>}
        </dl>

        <table className="pos-receipt-items">
          <thead><tr><th>品項</th><th>數量</th><th>金額</th></tr></thead>
          <tbody>
            {sale.items.map((item) => (
              <tr key={item.id}>
                <td>
                  <strong>{item.product.name}</strong>
                  <small>{item.product.sku}{item.product.spec ? `／${item.product.spec}` : ""}</small>
                  {Number(item.discount) > 0 && <small>折扣 -{money(item.discount)}</small>}
                </td>
                <td>{Number(item.quantity)}</td>
                <td>{money(item.subtotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <section className="pos-receipt-totals">
          <div><span>未稅小計</span><strong>{money(sale.subtotal)}</strong></div>
          <div><span>折扣</span><strong>-{money(sale.discount)}</strong></div>
          {Number(sale.promotionDiscount) > 0 && <div><span>其中促銷</span><strong>-{money(sale.promotionDiscount)}</strong></div>}
          {Number(sale.couponDiscount) > 0 && <div><span>其中優惠券</span><strong>-{money(sale.couponDiscount)}</strong></div>}
          {Number(sale.pointsDiscount) > 0 && <div><span>其中點數折抵</span><strong>-{money(sale.pointsDiscount)}</strong></div>}
          <div><span>稅額</span><strong>{money(sale.taxAmount)}</strong></div>
          <div className="grand"><span>應收總額</span><strong>{money(sale.total)}</strong></div>
          {refunded > 0 && <div><span>累計退款</span><strong>-{money(refunded)}</strong></div>}
        </section>

        {(sale.loyaltyPointsEarned > 0 || sale.loyaltyPointsRedeemed > 0) && <section className="pos-receipt-payments"><h2>會員點數</h2>{sale.loyaltyPointsRedeemed > 0 && <div><span>本筆使用</span><strong>{sale.loyaltyPointsRedeemed} 點</strong></div>}{sale.loyaltyPointsEarned > 0 && <div><span>本筆獲得</span><strong>{sale.loyaltyPointsEarned} 點</strong></div>}</section>}

        <section className="pos-receipt-payments">
          <h2>付款明細</h2>
          {sale.payments.map((payment) => (
            <div key={payment.id}>
              <span>{PAYMENT_LABELS[payment.method] || payment.method}{payment.reference ? `（${payment.reference}）` : ""}</span>
              <strong>{money(payment.amount)}</strong>
            </div>
          ))}
          {Number(sale.changeDue) > 0 && <div><span>找零</span><strong>{money(sale.changeDue)}</strong></div>}
        </section>

        <footer>
          {sale.electronicInvoice?.provider === "MOCK"
            ? <div>這是本機介接測試資料，不會上傳財政部，也不具稅務效力。</div>
            : !sale.electronicInvoice
              ? <div>本單僅供交易核對，不等同財政部電子發票證明聯。</div>
              : sale.electronicInvoice.status !== "ISSUED"
                ? <div>電子發票尚未完成，請勿作為正式證明聯。</div>
                : null}
          <div>謝謝光臨</div>
        </footer>
      </article>
    </>
  );
}
