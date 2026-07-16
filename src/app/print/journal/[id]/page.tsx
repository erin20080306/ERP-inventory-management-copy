import { prisma } from "@/lib/prisma";
import { requirePermission, requireTenantId } from "@/lib/api";
import { notFound } from "next/navigation";
import { AutoPrint } from "../../auto-print";
import { CompanyHeader } from "../../CompanyHeader";
import { formatDate, formatMoney } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function PrintJournal({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("journals.view");
  const [{ id }, tenantId] = await Promise.all([params, requireTenantId()]);
  const entry = await prisma.journalEntry.findFirst({
    where: { id, tenantId },
    include: { lines: { include: { account: true } }, createdBy: true },
  });
  if (!entry) notFound();

  const totalDebit = entry.lines.reduce((s: number, l: any) => s + Number(l.debit), 0);
  const totalCredit = entry.lines.reduce((s: number, l: any) => s + Number(l.credit), 0);

  // 金額中文大寫
  function toChineseAmount(n: number): string {
    if (!n) return "零元整";
    const digits = ["零", "壹", "貳", "參", "肆", "伍", "陸", "柒", "捌", "玖"];
    const units = ["", "拾", "佰", "仟"];
    const bigUnits = ["", "萬", "億"];
    const [intStr, decStr = ""] = String(Math.abs(n).toFixed(2)).split(".");
    let result = "";
    let gi = 0;
    let rest = intStr;
    while (rest.length > 0) {
      const group = rest.slice(-4);
      rest = rest.slice(0, -4);
      let gStr = "";
      for (let i = 0; i < group.length; i++) {
        const d = Number(group[i]);
        const u = group.length - 1 - i;
        gStr += (d === 0 ? "零" : digits[d] + units[u]);
      }
      gStr = gStr.replace(/零+/g, "零").replace(/零$/, "");
      result = (gStr ? gStr + bigUnits[gi] : "") + result;
      gi++;
    }
    result += "元";
    const d1 = Number(decStr[0] ?? 0);
    const d2 = Number(decStr[1] ?? 0);
    if (d1 === 0 && d2 === 0) result += "整";
    else result += (d1 ? digits[d1] + "角" : "") + (d2 ? digits[d2] + "分" : "");
    return result;
  }

  const statusLabel: Record<string, string> = { DRAFT: "草稿", POSTED: "已過帳", VOID: "已作廢" };

  // 將金額拆成 11 個位數欄 (億千百十萬千百十元角分)
  const AMOUNT_UNITS = ["億", "仟", "佰", "拾", "萬", "仟", "佰", "拾", "元", "角", "分"];
  function splitAmount(n: number): string[] {
    if (!n) return AMOUNT_UNITS.map(() => "");
    const cents = Math.round(Math.abs(n) * 100);
    const intPart = Math.floor(cents / 100);
    const fracPart = cents % 100;
    const intStr = String(intPart);
    const padded = intStr.padStart(9, " ");
    const arr = padded.split("").map((c) => (c === " " ? "" : c));
    arr.push(String(Math.floor(fracPart / 10)));
    arr.push(String(fracPart % 10));
    // 結果長度 11，對應 AMOUNT_UNITS
    return arr;
  }

  // 中式年月日 (民國年)
  const d = new Date(entry.entryDate);
  const rocYear = d.getFullYear() - 1911;
  const dateStr = `中華民國 ${rocYear} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日`;

  // 推測傳票類型 (現金收入 / 現金支出 / 轉帳)
  const cashCodes = new Set(["1101", "1102", "1103", "1104", "1105"]);
  const cashDebit = entry!.lines.some((l: any) => cashCodes.has(l.account.code) && Number(l.debit) > 0);
  const cashCredit = entry!.lines.some((l: any) => cashCodes.has(l.account.code) && Number(l.credit) > 0);
  function guessVoucherKind(): string {
    if (cashDebit && !cashCredit) return "現金收入傳票";
    if (cashCredit && !cashDebit) return "現金支出傳票";
    return "轉帳傳票";
  }

  const voucherKind = guessVoucherKind();

  const e = entry!;
  // 民國日期 (傳票日期)
  const rocDate = `${rocYear}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;

  // 至少 5 行 (含補空白)
  const minRows = 5;
  const dataLines = e.lines;
  const blankCount = Math.max(0, minRows - dataLines.length);

  const VoucherBlock = () => (
    <div className="voucher-half-block">
      <CompanyHeader />
      <div className="trad-voucher-title">
        {voucherKind.replace("傳票", "").replace("傳　票", "")} 傳　票
      </div>
      <div className="trad-voucher-meta">
        <div className="left">傳票日期：{rocDate}</div>
        <div className="right">
          <div className="page-no">1/1</div>
          <div>傳票號碼：{e.number}</div>
        </div>
      </div>
      <table className="trad-voucher-table">
        <thead>
          <tr>
            <th className="col-account">會 計 科 目</th>
            <th className="col-code">科目代號</th>
            <th className="col-particulars">摘　　　　　要</th>
            <th className="col-amt">借　方</th>
            <th className="col-amt">貸　方</th>
          </tr>
        </thead>
        <tbody>
          {dataLines.map((l: any) => (
            <tr key={l.id}>
              <td>{l.account.name}</td>
              <td className="center">{l.account.code}</td>
              <td>{l.memo ?? ""}</td>
              <td className="num">{Number(l.debit) > 0 ? formatMoney(l.debit).replace("NT$ ", "") : ""}</td>
              <td className="num">{Number(l.credit) > 0 ? formatMoney(l.credit).replace("NT$ ", "") : ""}</td>
            </tr>
          ))}
          {Array.from({ length: blankCount }).map((_, i) => (
            <tr key={`empty-${i}`} className="blank">
              <td>&nbsp;</td><td></td><td></td><td></td><td></td>
            </tr>
          ))}
          <tr className="total-row">
            <td colSpan={3} className="center">合　　計</td>
            <td className="num">{formatMoney(totalDebit).replace("NT$ ", "")}</td>
            <td className="num">{formatMoney(totalCredit).replace("NT$ ", "")}</td>
          </tr>
        </tbody>
      </table>
      <table className="trad-sign-table">
        <tbody>
          <tr>
            <td className="sign-label">主管</td><td className="sign-area"></td>
            <td className="sign-label">核准</td><td className="sign-area"></td>
            <td className="sign-label">出納</td><td className="sign-area"></td>
            <td className="sign-label">覆核</td><td className="sign-area"></td>
            <td className="sign-label">會計</td><td className="sign-area"></td>
            <td className="sign-label">製表</td><td className="sign-area">{e.createdBy?.name ?? ""}</td>
          </tr>
        </tbody>
      </table>
      <div className="trad-remark">傳票備註：{e.summary || ""}</div>
    </div>
  );

  return (
    <>
      <AutoPrint />
      <div className="sheet-a4-cut">
        <VoucherBlock />
        <div className="cut-line">✂ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ 沿線剪裁 (中一刀) ─ ─ ─ ─ ─ ─ ─ ─ ─ ─</div>
        <VoucherBlock />
      </div>
    </>
  );
}
