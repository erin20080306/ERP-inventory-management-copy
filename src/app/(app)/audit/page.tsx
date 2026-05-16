import { PageShell } from "@/components/layout/page-shell";
import { requirePermissionOrForbidden } from "@/components/perm-guard";
import { prisma } from "@/lib/prisma";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDateTime } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function Page() {
  const g = await requirePermissionOrForbidden("audit.view");
  if (g.forbidden) return g.element;
  const [logs, logins] = await Promise.all([
    prisma.auditLog.findMany({ take: 200, orderBy: { createdAt: "desc" }, include: { user: true } }),
    prisma.loginLog.findMany({ take: 100, orderBy: { createdAt: "desc" } }),
  ]);
  return (
    <PageShell title="稽核紀錄" description="追蹤系統操作與登入紀錄，確保資訊安全">
      <Card>
        <CardHeader><CardTitle>操作紀錄 (最近 200 筆)</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <THead><TR><TH>時間</TH><TH>使用者</TH><TH>模組</TH><TH>動作</TH><TH>對象</TH><TH>備註</TH><TH>IP</TH></TR></THead>
            <TBody>
              {logs.length === 0 && <TR><TD colSpan={7} className="text-center text-muted-foreground">尚無資料</TD></TR>}
              {logs.map((l: any) => (
                <TR key={l.id}>
                  <TD className="text-xs">{formatDateTime(l.createdAt)}</TD>
                  <TD>{l.user?.name ?? "—"}</TD>
                  <TD>{l.module}</TD>
                  <TD>{l.action}</TD>
                  <TD className="font-mono text-xs">{l.refId ?? "—"}</TD>
                  <TD>{l.detail ?? "—"}</TD>
                  <TD className="text-xs">{l.ip ?? "—"}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>登入紀錄 (最近 100 筆)</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <THead><TR><TH>時間</TH><TH>帳號</TH><TH>結果</TH><TH>IP</TH><TH>User-Agent</TH></TR></THead>
            <TBody>
              {logins.length === 0 && <TR><TD colSpan={5} className="text-center text-muted-foreground">尚無資料</TD></TR>}
              {logins.map((l: any) => (
                <TR key={l.id}>
                  <TD className="text-xs">{formatDateTime(l.createdAt)}</TD>
                  <TD className="font-mono text-xs">{l.username}</TD>
                  <TD className={l.success ? "text-emerald-600" : "text-red-600"}>{l.success ? "成功" : "失敗"}</TD>
                  <TD className="text-xs">{l.ip ?? "—"}</TD>
                  <TD className="text-xs truncate max-w-xs">{l.userAgent ?? "—"}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </PageShell>
  );
}
