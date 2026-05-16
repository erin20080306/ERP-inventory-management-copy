"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils";
import { Building2, Users, Shield, Loader2, Activity, LogIn, LogOut } from "lucide-react";
import { signOut } from "next-auth/react";

export default function AdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === "loading") return;
    if (!session?.user?.isSuperAdmin) {
      router.replace("/dashboard");
      return;
    }
    fetch("/api/admin/tenants")
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [session, status, router]);

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="h-8 w-8 text-amber-400" />
            <div>
              <h1 className="text-2xl font-bold">超級管理員後台</h1>
              <p className="text-sm text-slate-400">平台租戶與用戶總覽</p>
            </div>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white text-sm font-medium transition"
          >
            <LogOut className="h-4 w-4" />
            登出
          </button>
        </div>

        {/* 統計卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-slate-900 border-slate-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-slate-400 flex items-center gap-2">
                <Building2 className="h-4 w-4" /> 租戶總數
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-indigo-400">{data.totalTenants}</div>
            </CardContent>
          </Card>
          <Card className="bg-slate-900 border-slate-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-slate-400 flex items-center gap-2">
                <Users className="h-4 w-4" /> 用戶總數
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-emerald-400">{data.totalUsers}</div>
            </CardContent>
          </Card>
          <Card className="bg-slate-900 border-slate-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-slate-400 flex items-center gap-2">
                <Users className="h-4 w-4" /> 已付款用戶
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-amber-400">
                {data.users.filter((u: any) => u.isPaid).length}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-slate-900 border-slate-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-slate-400 flex items-center gap-2">
                <Activity className="h-4 w-4" /> 實際使用者
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-cyan-400">
                {data.users.filter((u: any) => u.loginCount > 1 || u.actionCount > 0).length}
              </div>
              <div className="text-xs text-slate-500 mt-1">登入超過1次或有操作紀錄</div>
            </CardContent>
          </Card>
        </div>

        {/* 租戶列表 */}
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader>
            <CardTitle className="text-lg">所有租戶</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <THead>
                <TR>
                  <TH>公司名稱</TH>
                  <TH>用戶數</TH>
                  <TH>建立時間</TH>
                  <TH>ID</TH>
                </TR>
              </THead>
              <TBody>
                {data.tenants.map((t: any) => (
                  <TR key={t.id}>
                    <TD className="font-medium">{t.name}</TD>
                    <TD><Badge variant="info">{t.userCount} 人</Badge></TD>
                    <TD className="text-sm text-slate-400">{formatDateTime(t.createdAt)}</TD>
                    <TD className="text-xs font-mono text-slate-500">{t.id}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>

        {/* 用戶列表 */}
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader>
            <CardTitle className="text-lg">所有用戶</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <THead>
                  <TR>
                    <TH>帳號</TH>
                    <TH>姓名</TH>
                    <TH>Email</TH>
                    <TH>所屬公司</TH>
                    <TH>付款狀態</TH>
                    <TH>登入次數</TH>
                    <TH>操作次數</TH>
                    <TH>上次登入</TH>
                    <TH>使用狀況</TH>
                  </TR>
                </THead>
                <TBody>
                  {data.users.map((u: any) => (
                    <TR key={u.id}>
                      <TD className="font-mono text-xs">{u.username}</TD>
                      <TD>{u.name}</TD>
                      <TD className="text-sm">{u.email}</TD>
                      <TD className="text-sm">{u.tenantName ?? <span className="text-amber-400">超級管理員</span>}</TD>
                      <TD>
                        {u.isSuperAdmin ? (
                          <Badge variant="warning">管理員</Badge>
                        ) : u.isPaid ? (
                          <Badge variant="success">已付款</Badge>
                        ) : (
                          <Badge variant="danger">試用中</Badge>
                        )}
                      </TD>
                      <TD className="text-center font-mono">{u.loginCount}</TD>
                      <TD className="text-center font-mono">{u.actionCount}</TD>
                      <TD className="text-sm text-slate-400">{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : "—"}</TD>
                      <TD>
                        {u.actionCount > 0 ? (
                          <Badge variant="success">有使用</Badge>
                        ) : u.loginCount > 1 ? (
                          <Badge variant="info">僅登入</Badge>
                        ) : (
                          <Badge variant="danger">未使用</Badge>
                        )}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          </CardContent>
        </Card>
        {/* 最近登入紀錄 */}
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <LogIn className="h-5 w-5" /> 最近登入紀錄
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <THead>
                  <TR>
                    <TH>帳號</TH>
                    <TH>結果</TH>
                    <TH>IP</TH>
                    <TH>時間</TH>
                  </TR>
                </THead>
                <TBody>
                  {(data.recentLogins ?? []).map((l: any, i: number) => (
                    <TR key={i}>
                      <TD className="font-mono text-xs">{l.username}</TD>
                      <TD>{l.success ? <Badge variant="success">成功</Badge> : <Badge variant="danger">失敗</Badge>}</TD>
                      <TD className="text-xs text-slate-400 font-mono">{l.ip || "—"}</TD>
                      <TD className="text-sm text-slate-400">{formatDateTime(l.createdAt)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
