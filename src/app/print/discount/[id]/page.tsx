import { prisma } from "@/lib/prisma";
import { requirePermission, requireTenantId } from "@/lib/api";
import { notFound } from "next/navigation";
import { AutoPrint } from "../../auto-print";
import { CompanyHeader } from "../../CompanyHeader";
import { formatDate, formatMoney } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("receivables.view");
  const [{ id }, tenantId] = await Promise.all([params, requireTenantId()]);
  const dn = await prisma.discountNote.findFirst({
    where: { id, tenantId },
    include: { customer: true, supplier: true },
  });
  if (!dn) notFound();
  const party = dn.customer ?? dn.supplier;
  const title = dn.type === "SALES" ? "銷 售 折 讓 單" : "採 購 折 讓 單";
  const partyLabel = dn.type === "SALES" ? "客　　戶" : "供 應 商";
  return (
    <>
      <AutoPrint />
      <div className="sheet">
        <CompanyHeader />
        <div className="doc-title">{title}</div>
        <div className="meta">
          <div><span className="label">折讓單號：</span>{dn.number}</div>
          <div><span className="label">日　　期：</span>{formatDate(dn.createdAt)}</div>
          <div><span className="label">{partyLabel}：</span>{party?.companyName ?? "—"}</div>
          <div><span className="label">統一編號：</span>{party?.taxId ?? "—"}</div>
          {dn.relNumber && <div><span className="label">原單據號：</span>{dn.relNumber}</div>}
        </div>
        <table className="doc-table">
          <thead>
            <tr>
              <th style={{ width: 40 }}>#</th>
              <th>折讓原因</th>
              <th style={{ width: 150 }} className="num">折讓金額</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ textAlign: "center" }}>1</td>
              <td>{dn.reason || "折讓"}</td>
              <td className="num">{formatMoney(dn.amount).replace("NT$ ", "")}</td>
            </tr>
            {Array.from({ length: 4 }).map((_, i) => (
              <tr key={i}><td>&nbsp;</td><td></td><td className="num"></td></tr>
            ))}
          </tbody>
        </table>
        <div className="totals">
          <div className="remark-box"><span className="label">備註：</span>{dn.reason ?? ""}</div>
          <div className="summary">
            <div className="row-total">折讓合計</div>
            <div className="row-total">{formatMoney(dn.amount).replace("NT$ ", "")}</div>
          </div>
        </div>
        <div style={{ marginTop: 40, display: "flex", justifyContent: "space-between" }}>
          <div style={{ textAlign: "center", width: "30%" }}>
            <div style={{ borderTop: "1px solid #000", paddingTop: 4 }}>主管簽章</div>
          </div>
          <div style={{ textAlign: "center", width: "30%" }}>
            <div style={{ borderTop: "1px solid #000", paddingTop: 4 }}>經辦人</div>
          </div>
          <div style={{ textAlign: "center", width: "30%" }}>
            <div style={{ borderTop: "1px solid #000", paddingTop: 4 }}>{dn.type === "SALES" ? "客戶簽收" : "供應商確認"}</div>
          </div>
        </div>
        <div className="footer-note">列印時間：{new Date().toLocaleString("zh-TW")}</div>
      </div>
    </>
  );
}
