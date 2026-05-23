import { PageShell } from "@/components/layout/page-shell";
import { requirePermissionOrForbidden } from "@/components/perm-guard";
import { prisma } from "@/lib/prisma";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDateTime } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireTenantId } from "@/lib/api";

export const dynamic = "force-dynamic";

// 模組名稱中文映射
const moduleNames: Record<string, string> = {
  sales: "銷售管理",
  purchases: "採購管理",
  customers: "客戶管理",
  suppliers: "供應商管理",
  products: "產品管理",
  inventory: "庫存管理",
  returns: "退貨管理",
  quotations: "報價單",
  invoices: "發票管理",
  journals: "傳票管理",
  receivables: "應收帳款",
  payables: "應付帳款",
  "notes-receivable": "應收票據",
  "notes-payable": "應付票據",
  roles: "角色權限",
  users: "使用者管理",
  warehouses: "倉庫管理",
  hr: "人事管理",
  banking: "銀行管理",
  accounting: "會計管理",
  settings: "系統設定",
};

// 動作名稱中文映射
const actionNames: Record<string, string> = {
  create: "建立",
  update: "修改",
  delete: "刪除",
  view: "查看",
  edit: "編輯",
  receive: "收款",
  pay: "付款",
  void: "作廢",
  approve: "核准",
  reject: "拒絕",
  export: "匯出",
  import: "匯入",
};

function translateModule(module: string) {
  return moduleNames[module] || module;
}

function translateAction(action: string) {
  return actionNames[action] || action;
}

function formatRefId(detail: string | null, refId: string | null) {
  // 如果 detail 有內容，優先顯示 detail（通常包含有意義的資訊）
  if (detail && detail.trim()) {
    return detail;
  }
  // 否則顯示 ID
  return refId || "—";
}

export default async function Page() {
  const g = await requirePermissionOrForbidden("audit.view");
  if (g.forbidden) return g.element;
  const tenantId = await requireTenantId();
  const [logs, logins] = await Promise.all([
    prisma.auditLog.findMany({
      take: 200,
      orderBy: { createdAt: "desc" },
      where: { user: { tenantId } },
      include: { user: true },
    }),
    prisma.loginLog.findMany({
      take: 100,
      orderBy: { createdAt: "desc" },
      where: { user: { tenantId } },
    }),
  ]);
  return (
    <PageShell title="稽核紀錄" description="追蹤系統操作與登入紀錄，確保資訊安全">
      <Card>
        <CardHeader><CardTitle>操作紀錄 (最近 200 筆)</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <THead><TR><TH>時間</TH><TH>使用者</TH><TH>模組</TH><TH>動作</TH><TH>對象</TH><TH>IP</TH></TR></THead>
            <TBody>
              {logs.length === 0 && <TR><TD colSpan={6} className="text-center text-muted-foreground">尚無資料</TD></TR>}
              {logs.map((l: any) => (
                <TR key={l.id}>
                  <TD className="text-xs">{formatDateTime(l.createdAt)}</TD>
                  <TD>{l.user?.name ?? "—"}</TD>
                  <TD>{translateModule(l.module)}</TD>
                  <TD>{translateAction(l.action)}</TD>
                  <TD className="text-xs">{formatRefId(l.detail, l.refId)}</TD>
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
