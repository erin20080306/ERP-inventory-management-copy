import { notFound } from "next/navigation";
import { AutoPrint } from "../../auto-print";
import { requireRestaurantPermission, requireTenantId } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function KitchenTicketPrintPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ embedded?: string }>;
}) {
  const session = await requireRestaurantPermission("view");
  const [{ id }, query, tenantId] = await Promise.all([params, searchParams, requireTenantId(session)]);
  const [ticket, company] = await Promise.all([
    prisma.restaurantKitchenTicket.findFirst({
      where: { id, tenantId },
      include: {
        order: { include: { table: true } },
        items: {
          include: {
            orderItem: {
              include: { product: { select: { sku: true, name: true } } },
            },
          },
        },
      },
    }),
    prisma.companySetting.findFirst({ where: { tenantId } }),
  ]);

  if (!ticket) notFound();

  return (
    <>
      {query.embedded !== "1" && <AutoPrint />}
      <article className="pos-receipt">
        <header className="pos-receipt-header">
          <h1>{company?.name || "餐飲門市"}</h1>
          <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: 4 }}>廚房單</div>
        </header>

        <div className="pos-receipt-warning">請依備註與送單順序製作</div>

        <dl className="pos-receipt-meta">
          <div><dt>廚房單號</dt><dd>{ticket.number}</dd></div>
          <div><dt>桌位</dt><dd style={{ fontSize: 18, fontWeight: 900 }}>{ticket.order.table.name}</dd></div>
          <div><dt>桌單</dt><dd>{ticket.order.number}</dd></div>
          <div><dt>工作站</dt><dd>{ticket.station}</dd></div>
          <div><dt>送單時間</dt><dd>{ticket.sentAt.toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}</dd></div>
          <div><dt>送單人員</dt><dd>{session.user.name || session.user.username}</dd></div>
        </dl>

        <table className="pos-receipt-items">
          <thead><tr><th>餐點</th><th>數量</th></tr></thead>
          <tbody>
            {ticket.items.map(({ orderItem }) => (
              <tr key={orderItem.id}>
                <td>
                  <strong style={{ fontSize: 15 }}>{orderItem.product.name}</strong>
                  <small>{orderItem.product.sku}</small>
                  {orderItem.course && <small>出餐順序：{orderItem.course}</small>}
                  {orderItem.note && <strong style={{ marginTop: 4, fontSize: 14 }}>備註：{orderItem.note}</strong>}
                </td>
                <td style={{ fontSize: 20, fontWeight: 900 }}>{Number(orderItem.quantity)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <footer>
          <div>狀態：{ticket.status}</div>
          <div>— 廚房製作聯 —</div>
        </footer>
      </article>
    </>
  );
}
