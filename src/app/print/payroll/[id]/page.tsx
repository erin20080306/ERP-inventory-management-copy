import { prisma } from "@/lib/prisma";
import { requirePermission, requireTenantId } from "@/lib/api";
import { notFound } from "next/navigation";
import { AutoPrint } from "../../auto-print";
import { CompanyHeader } from "../../CompanyHeader";
import { formatMoney } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function PrintPayroll({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("payroll.view");
  const [{ id }, tenantId] = await Promise.all([params, requireTenantId()]);
  const p = await prisma.payroll.findFirst({
    where: { id, employee: { tenantId } },
    include: { employee: { include: { department: true } }, period: true, items: true },
  });
  if (!p) notFound();

  const earnings = p!.items.filter((i: any) => i.type === "EARNING");
  const deductions = p!.items.filter((i: any) => i.type === "DEDUCTION");
  const employer = p!.items.filter((i: any) => i.type === "EMPLOYER");

  const fmt = (n: any) => formatMoney(n).replace("NT$ ", "");

  return (
    <>
      <AutoPrint />
      <div className="sheet-half">
        <CompanyHeader />
        <div className="trad-voucher-title">薪　資　單</div>
        <div className="trad-voucher-meta">
          <div className="left">薪資期間：{p!.period.year} 年 {String(p!.period.month).padStart(2, "0")} 月</div>
          <div className="right">
            <div>單號：{p!.number}</div>
            <div>列印日期：{new Date().toLocaleDateString("zh-TW")}</div>
          </div>
        </div>

        <table style={{ width: "100%", fontSize: 12, marginBottom: 6 }}>
          <tbody>
            <tr>
              <td style={{ padding: 2 }}><b>員工編號：</b>{p!.employee.employeeNo}</td>
              <td style={{ padding: 2 }}><b>姓名：</b>{p!.employee.name}</td>
              <td style={{ padding: 2 }}><b>部門：</b>{p!.employee.department?.name ?? "—"}</td>
              <td style={{ padding: 2 }}><b>職稱：</b>{p!.employee.position ?? "—"}</td>
            </tr>
          </tbody>
        </table>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          <table className="trad-voucher-table">
            <thead><tr><th colSpan={2} style={{ background: "#ecfdf5" }}>應 發 項 目</th></tr></thead>
            <tbody>
              {earnings.map((i: any) => (
                <tr key={i.id}>
                  <td>{i.name}</td>
                  <td className="num">{fmt(i.amount)}</td>
                </tr>
              ))}
              <tr className="total-row">
                <td>合　計</td>
                <td className="num">{fmt(p!.earnings)}</td>
              </tr>
            </tbody>
          </table>

          <table className="trad-voucher-table">
            <thead><tr><th colSpan={2} style={{ background: "#fef2f2" }}>應 扣 項 目</th></tr></thead>
            <tbody>
              {deductions.map((i: any) => (
                <tr key={i.id}>
                  <td>{i.name}</td>
                  <td className="num">{fmt(i.amount)}</td>
                </tr>
              ))}
              <tr className="total-row">
                <td>合　計</td>
                <td className="num">{fmt(p!.deductions)}</td>
              </tr>
            </tbody>
          </table>

          <table className="trad-voucher-table">
            <thead><tr><th colSpan={2} style={{ background: "#fffbeb" }}>雇 主 負 擔</th></tr></thead>
            <tbody>
              {employer.map((i: any) => (
                <tr key={i.id}>
                  <td>{i.name}</td>
                  <td className="num">{fmt(i.amount)}</td>
                </tr>
              ))}
              <tr className="total-row">
                <td>合　計</td>
                <td className="num">{fmt(p!.employerCost)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 12, padding: "8px 16px", border: "2px solid #000", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 16 }}>
          <b>實 領 金 額</b>
          <b style={{ fontSize: 20 }}>NT$ {fmt(p!.netPay)}</b>
        </div>

        <table className="trad-sign-table" style={{ marginTop: 8 }}>
          <tbody>
            <tr>
              <td className="sign-label">主管</td><td className="sign-area"></td>
              <td className="sign-label">會計</td><td className="sign-area"></td>
              <td className="sign-label">出納</td><td className="sign-area"></td>
              <td className="sign-label">員工簽收</td><td className="sign-area"></td>
            </tr>
          </tbody>
        </table>

        <div className="trad-remark">備註：{p!.remark || ""}</div>
      </div>
    </>
  );
}
