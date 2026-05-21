"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils";
import { Building2, Users, Shield, Loader2, Activity, LogIn, LogOut, Trash2 } from "lucide-react";
import { signOut } from "next-auth/react";

const TRIAL_DAYS = 2;

function getTenantStatus(user: any) {
  if (!user) return <Badge variant="danger">無用戶</Badge>;
  if (user.isSuperAdmin) return <Badge variant="warning">管理員</Badge>;
  if (user.isPaid && user.paymentType === "ONCE") return <Badge variant="success">一次付款（永久）</Badge>;
  if (user.isPaid && user.paymentType === "MONTHLY") {
    const subEnd = user.subscriptionEnd ? new Date(user.subscriptionEnd).getTime() : 0;
    if (Date.now() < subEnd) {
      const days = Math.ceil((subEnd - Date.now()) / (1000 * 60 * 60 * 24));
      return <Badge variant="info">月租付款中（剩 {days} 天）</Badge>;
    }
    return <Badge variant="danger">月租到期未付款</Badge>;
  }
  if (user.isPaid) return <Badge variant="success">已付款</Badge>;
  // Trial check
  const trialStart = new Date(user.trialStart).getTime();
  const expireTs = trialStart + TRIAL_DAYS * 24 * 60 * 60 * 1000;
  if (Date.now() >= expireTs) return <Badge variant="danger">試用已到期</Badge>;
  const remainHours = Math.ceil((expireTs - Date.now()) / (1000 * 60 * 60));
  return <Badge variant="warning">試用中（剩 {remainHours} 小時）</Badge>;
}

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
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Shield className="h-8 w-8 text-amber-400" />
            <div>
              <h1 className="text-2xl font-bold">超級管理員後台</h1>
              <p className="text-sm text-slate-400">平台租戶與用戶總覽</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={async () => {
                if (!confirm("確定刪除所有未登入過的租戶？此操作無法復原。")) return;
                const res = await fetch("/api/admin/tenants", { method: "DELETE" });
                const d = await res.json();
                if (res.ok) {
                  alert(`已刪除 ${d.deletedCount} 個租戶`);
                  fetch("/api/admin/tenants")
                    .then((r) => r.json())
                    .then(setData)
                    .finally(() => setLoading(false));
                } else {
                  alert("刪除失敗");
                }
              }}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-medium transition"
            >
              <Trash2 className="h-4 w-4" />
              刪除未登入租戶
            </button>
            <button
              onClick={() => router.push("/login")}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium transition"
            >
              <LogIn className="h-4 w-4" />
              登入介面
            </button>
            <button
              onClick={() => router.push("/dashboard")}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition"
            >
              <LogIn className="h-4 w-4" />
              進入前台
            </button>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white text-sm font-medium transition"
            >
              <LogOut className="h-4 w-4" />
              登出
            </button>
          </div>
        </div>

        {/* 統計卡片 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
                  <TH>訂閱狀態</TH>
                  <TH>建立時間</TH>
                  <TH>ID</TH>
                </TR>
              </THead>
              <TBody>
                {data.tenants.map((t: any) => {
                  const tenantUsers = data.users.filter((u: any) => u.tenantId === t.id);
                  const firstUser = tenantUsers.length > 0 ? tenantUsers[tenantUsers.length - 1] : null;
                  const status = getTenantStatus(firstUser);
                  return (
                    <TR key={t.id}>
                      <TD className="font-medium">{t.name}</TD>
                      <TD><Badge variant="info">{t.userCount} 人</Badge></TD>
                      <TD>{status}</TD>
                      <TD className="text-sm text-slate-400">{formatDateTime(t.createdAt)}</TD>
                      <TD className="text-xs font-mono text-slate-500">{t.id}</TD>
                    </TR>
                  );
                })}
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
            {/* 桌面版表格 */}
            <div className="hidden md:block overflow-x-auto">
              <Table className="text-xs">
                <THead>
                  <TR>
                    <TH className="px-2 py-2 whitespace-nowrap">帳號</TH>
                    <TH className="px-2 py-2 whitespace-nowrap">姓名</TH>
                    <TH className="px-2 py-2 whitespace-nowrap">Email</TH>
                    <TH className="px-2 py-2 whitespace-nowrap">公司</TH>
                    <TH className="px-2 py-2 whitespace-nowrap">付款</TH>
                    <TH className="px-2 py-2 whitespace-nowrap text-indigo-300">登入</TH>
                    <TH className="px-2 py-2 whitespace-nowrap text-emerald-300">操作</TH>
                    <TH className="px-2 py-2 whitespace-nowrap text-amber-300">上次登入</TH>
                    <TH className="px-2 py-2 whitespace-nowrap text-cyan-300">註冊IP</TH>
                    <TH className="px-2 py-2 whitespace-nowrap">狀況</TH>
                    <TH className="px-2 py-2 whitespace-nowrap">操作</TH>
                  </TR>
                </THead>
                <TBody>
                  {data.users.map((u: any) => (
                    <TR key={u.id}>
                      <TD className="px-2 py-2 font-mono whitespace-nowrap">{u.username}</TD>
                      <TD className="px-2 py-2 whitespace-nowrap">{u.name}</TD>
                      <TD className="px-2 py-2 whitespace-nowrap">{u.email}</TD>
                      <TD className="px-2 py-2 whitespace-nowrap">{u.tenantName ?? <span className="text-amber-400">超級管理員</span>}</TD>
                      <TD className="px-2 py-2 whitespace-nowrap">
                        {u.isSuperAdmin ? (
                          <Badge variant="warning">管理員</Badge>
                        ) : u.isPaid ? (
                          <Badge variant="success">已付款</Badge>
                        ) : (
                          <Badge variant="danger">試用中</Badge>
                        )}
                      </TD>
                      <TD className="px-2 py-2 text-center font-mono text-indigo-300 whitespace-nowrap">{u.loginCount}</TD>
                      <TD className="px-2 py-2 text-center font-mono text-emerald-300 whitespace-nowrap">{u.actionCount}</TD>
                      <TD className="px-2 py-2 text-amber-300 whitespace-nowrap">{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : "—"}</TD>
                      <TD className="px-2 py-2 text-cyan-300 font-mono whitespace-nowrap">{u.registrationIp || "—"}</TD>
                      <TD className="px-2 py-2 whitespace-nowrap">
                        {u.actionCount > 0 ? (
                          <Badge variant="success">有使用</Badge>
                        ) : u.loginCount > 1 ? (
                          <Badge variant="info">僅登入</Badge>
                        ) : (
                          <Badge variant="danger">未使用</Badge>
                        )}
                      </TD>
                      <TD className="px-2 py-2 whitespace-nowrap">
                        <UserActions u={u} setData={setData} />
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
            {/* 手機版卡片 */}
            <div className="md:hidden space-y-3">
              {data.users.map((u: any) => (
                <div key={u.id} className="rounded-xl bg-slate-800/60 border border-slate-700 p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="font-medium text-white">{u.name || u.username}</div>
                      <div className="text-xs text-slate-400 font-mono">{u.username}</div>
                    </div>
                    {u.isSuperAdmin ? (
                      <Badge variant="warning">管理員</Badge>
                    ) : u.isPaid ? (
                      <Badge variant="success">已付款</Badge>
                    ) : (
                      <Badge variant="danger">試用中</Badge>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div><span className="text-slate-500">公司：</span><span className="text-slate-300">{u.tenantName ?? <span className="text-amber-400">超級管理員</span>}</span></div>
                    <div><span className="text-slate-500">Email：</span><span className="text-slate-300">{u.email || "—"}</span></div>
                    <div><span className="text-slate-500">登入次數：</span><span className="font-mono text-indigo-300">{u.loginCount}</span></div>
                    <div><span className="text-slate-500">操作次數：</span><span className="font-mono text-emerald-300">{u.actionCount}</span></div>
                    <div className="col-span-2"><span className="text-slate-500">上次登入：</span><span className="text-amber-300">{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : "—"}</span></div>
                    <div className="col-span-2"><span className="text-slate-500">註冊IP：</span><span className="text-cyan-300 font-mono">{u.registrationIp || "—"}</span></div>
                    <div>
                      <span className="text-slate-500">使用狀況：</span>
                      {u.actionCount > 0 ? (
                        <Badge variant="success">有使用</Badge>
                      ) : u.loginCount > 1 ? (
                        <Badge variant="info">僅登入</Badge>
                      ) : (
                        <Badge variant="danger">未使用</Badge>
                      )}
                    </div>
                  </div>
                  <UserActions u={u} setData={setData} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        {/* 安全事件紀錄 */}
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Shield className="h-5 w-5 text-red-400" /> 安全事件紀錄 (SQL 注入偵測)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <THead>
                  <TR>
                    <TH>時間</TH>
                    <TH>類型</TH>
                    <TH>模組</TH>
                    <TH>詳細資訊</TH>
                    <TH>IP</TH>
                  </TR>
                </THead>
                <TBody>
                  {data.securityEvents && data.securityEvents.length > 0 ? (
                    data.securityEvents.map((log: any, i: number) => (
                      <TR key={i}>
                        <TD className="text-sm">{formatDateTime(log.createdAt)}</TD>
                        <TD>
                          <Badge variant="danger">{log.action}</Badge>
                        </TD>
                        <TD className="text-sm">{log.module}</TD>
                        <TD className="text-sm">{log.detail}</TD>
                        <TD className="font-mono text-xs">{log.ip}</TD>
                      </TR>
                    ))
                  ) : (
                    <TR>
                      <TD colSpan={5} className="text-center text-slate-500 py-4">
                        無安全事件紀錄
                      </TD>
                    </TR>
                  )}
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
                    <TH>狀態</TH>
                    <TH>IP</TH>
                    <TH>時間</TH>
                  </TR>
                </THead>
                <TBody>
                  {data.recentLogins.map((log: any, i: number) => (
                    <TR key={i}>
                      <TD className="font-mono text-xs">{log.username}</TD>
                      <TD>
                        <Badge variant={log.success ? "success" : "danger"}>
                          {log.success ? "成功" : "失敗"}
                        </Badge>
                      </TD>
                      <TD className="font-mono text-xs">{log.ip}</TD>
                      <TD className="text-sm">{formatDateTime(log.createdAt)}</TD>
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

function UserActions({ u, setData }: { u: any; setData: any }) {
  return (
    !u.isSuperAdmin && (
      <div className="flex flex-wrap gap-1">
        <button
          onClick={async () => {
            const msg = u.isPaid ? "確定取消永久使用權限？" : "確定授予永久使用權限？";
            if (!confirm(msg)) return;
            const res = await fetch("/api/admin/set-paid", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ userId: u.id, isPaid: !u.isPaid }),
            });
            if (res.ok) {
              setData((prev: any) => ({
                ...prev,
                users: prev.users.map((x: any) => x.id === u.id ? { ...x, isPaid: !u.isPaid } : x),
              }));
            }
          }}
          className={`px-3 py-1 rounded text-xs font-medium transition ${
            u.isPaid
              ? "bg-red-900/50 text-red-300 hover:bg-red-800"
              : "bg-emerald-900/50 text-emerald-300 hover:bg-emerald-800"
          }`}
        >
          {u.isPaid ? "取消永久" : "設為永久使用"}
        </button>
        {!u.isPaid && (
          <button
            onClick={async () => {
              const pw = prompt("請輸入超級管理員密碼以啟用不用付款使用：");
              if (!pw) return;
              const res = await fetch("/api/trial/free-use", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ password: pw, userId: u.id }),
              });
              if (res.ok) {
                setData((prev: any) => ({
                  ...prev,
                  users: prev.users.map((x: any) => x.id === u.id ? { ...x, isPaid: true } : x),
                }));
                alert("已啟用");
              } else {
                const d = await res.json();
                alert(d.error || "密碼錯誤");
              }
            }}
            className="px-3 py-1 rounded text-xs font-medium bg-amber-900/50 text-amber-300 hover:bg-amber-800 transition"
          >
            不用付款使用
          </button>
        )}
        {u.isPaid && (
          <button
            onClick={async () => {
              if (!confirm("確定解除永久使用並退回試用？（試用期仍從註冊日期計算）")) return;
              const res = await fetch("/api/admin/revoke-to-trial", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId: u.id }),
              });
              if (res.ok) {
                setData((prev: any) => ({
                  ...prev,
                  users: prev.users.map((x: any) => x.id === u.id ? { ...x, isPaid: false } : x),
                }));
              }
            }}
            className="px-3 py-1 rounded text-xs font-medium bg-orange-900/50 text-orange-300 hover:bg-orange-800 transition"
          >
            解除退回試用
          </button>
        )}
      </div>
    )
  );
}
