import { prisma } from "@/lib/prisma";

export async function CompanyHeader() {
  const c = await prisma.companySetting.findFirst();
  return (
    <div className="company-header">
      <div className="company-name">{c?.name ?? "公司名稱"}</div>
      <div className="company-sub">
        {c?.taxId && <span>統編：{c.taxId}　</span>}
        {c?.address && <span>{c.address}　</span>}
        {c?.phone && <span>TEL：{c.phone}　</span>}
        {c?.email && <span>Email：{c.email}</span>}
      </div>
    </div>
  );
}
