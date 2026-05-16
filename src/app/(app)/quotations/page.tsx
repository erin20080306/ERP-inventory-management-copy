import { PageShell } from "@/components/layout/page-shell";
import { requirePermissionOrForbidden } from "@/components/perm-guard";
import { prisma } from "@/lib/prisma";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/badge";
import { formatDate, formatMoney } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { PrintListButton, PDFExportButton } from "@/components/print-list-button";
import { requireTenantId } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function Page() {
  const g = await requirePermissionOrForbidden("quotations.view");
  if (g.forbidden) return g.element;
  const tenantId = await requireTenantId();
  const items = await prisma.quotation.findMany({
    where: { tenantId },
    include: { customer: true, items: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return (
    <PageShell title="報價單" description="管理客戶報價與狀態" actions={<><PDFExportButton title="報價單" filename="quotations" /><PrintListButton /></>}>
      <Card>
        <CardContent className="pt-6">
          <Table>
            <THead><TR><TH>單號</TH><TH>客戶</TH><TH>日期</TH><TH>有效期限</TH><TH>總計</TH><TH>狀態</TH></TR></THead>
            <TBody>
              {items.length === 0 && <TR><TD colSpan={6} className="text-center text-muted-foreground">尚無報價單</TD></TR>}
              {items.map((q: any) => (
                <TR key={q.id}>
                  <TD className="font-mono text-xs">{q.number}</TD>
                  <TD>{q.customer.companyName}</TD>
                  <TD>{formatDate(q.quoteDate)}</TD>
                  <TD>{formatDate(q.validUntil)}</TD>
                  <TD>{formatMoney(q.total)}</TD>
                  <TD><StatusBadge status={q.status} /></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </PageShell>
  );
}
