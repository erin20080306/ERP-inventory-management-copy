"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Building2, CheckCircle2, ChevronLeft, ChevronRight, KeyRound, LayoutDashboard,
  Loader2, LogOut, Mail, MonitorSmartphone, RefreshCw, Search, Shield, ShoppingBag, Store, Users, X, UtensilsCrossed, Download,
} from "lucide-react";
import { PLAN_CATALOG, formatTwd, type BillingCycle, type PlanCode } from "@/lib/plans";
import { getProductEdition, type BusinessMode } from "@/lib/product-editions";

type TenantRow = {
  id: string;
  name: string;
  businessMode: BusinessMode;
  createdAt: string;
  owner: { username: string; name: string; email: string } | null;
  userCount: number;
  deviceCount: number;
  serverCount: number;
  transactionCount: number;
  payments: Array<{
    id: string;
    planCode: string;
    billing: string;
    quotedAmount: string;
    paidAmount: string;
    paymentMethod: string;
    paymentReference: string;
    paidAt: string;
    createdAt: string;
  }>;
  connection: {
    companyCode: string | null;
    serverUrl: string | null;
    enabled: boolean;
    version: number;
  };
  license: {
    status: "paid" | "trial" | "expired" | "locked";
    reason?: string;
    planCode?: string | null;
    paymentType?: string;
    activatedAt?: string;
    expiresAt?: string | null;
    seatLimit: number;
    keyPrefix?: string | null;
  };
};

type AdminData = {
  rows: TenantRow[];
  inquiries: Array<{
    id: string;
    name: string;
    email: string;
    company: string;
    lineId: string | null;
    businessMode: BusinessMode;
    planCode: string;
    billing: BillingCycle;
    notes: string | null;
    notificationStatus: string;
    createdAt: string;
  }>;
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  stats: { totalTenants: number; totalUsers: number; erpCount: number; posCount: number; ecommerceCount: number; activeCount: number; pendingInquiryCount: number };
};

const emptyData: AdminData = {
  rows: [],
  inquiries: [],
  pagination: { page: 1, pageSize: 20, total: 0, totalPages: 1 },
  stats: { totalTenants: 0, totalUsers: 0, erpCount: 0, posCount: 0, ecommerceCount: 0, activeCount: 0, pendingInquiryCount: 0 },
};

export default function AdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [data, setData] = useState<AdminData>(emptyData);
  const [mode, setMode] = useState<"ALL" | "ERP" | "POS" | "ECOMMERCE">("ALL");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<TenantRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: "20" });
      if (mode !== "ALL") params.set("mode", mode);
      if (search) params.set("q", search);
      const response = await fetch(`/api/admin/tenants?${params}`, { cache: "no-store" });
      if (!response.ok) throw new Error((await response.json()).error || "無法載入管理資料");
      setData(await response.json());
    } catch (error) {
      alert(error instanceof Error ? error.message : "無法載入管理資料");
    } finally {
      setLoading(false);
    }
  }, [mode, page, search]);

  useEffect(() => {
    if (status === "loading") return;
    if (!session?.user?.isSuperAdmin) {
      router.replace("/dashboard");
      return;
    }
    void load();
  }, [load, router, session, status]);

  if (status === "loading") return <LoadingScreen />;

  return (
    <main className="min-h-screen bg-slate-950 p-4 text-slate-100 md:p-7">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col justify-between gap-4 xl:flex-row xl:items-center">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-400/15 text-amber-300"><Shield className="h-6 w-6" /></div>
            <div>
              <h1 className="text-2xl font-bold">艾琳設計・平台管理後台</h1>
              <p className="text-sm text-slate-400">ERP、電商與 POS 公司、授權席次及裝置統一管理</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/dashboard" className="admin-button bg-indigo-600 hover:bg-indigo-500"><LayoutDashboard className="h-4 w-4" />一般企業 ERP 後台</Link>
            <Link href="/store/atelier-noir" className="admin-button bg-rose-700 hover:bg-rose-600"><Store className="h-4 w-4" />電商網站</Link>
            <Link href="/pos" className="admin-button bg-emerald-600 hover:bg-emerald-500"><ShoppingBag className="h-4 w-4" />零售 POS</Link>
            <Link href="/pos/restaurant" className="admin-button bg-orange-600 hover:bg-orange-500"><UtensilsCrossed className="h-4 w-4" />餐飲 POS</Link>
            <Link href="/admin/downloads" className="admin-button border border-slate-700 bg-slate-900 hover:bg-slate-800"><Download className="h-4 w-4" />安裝包</Link>
            <button onClick={() => void load()} className="admin-button border border-slate-700 bg-slate-900 hover:bg-slate-800"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />更新</button>
            <button onClick={() => signOut({ callbackUrl: "/login" })} className="admin-button border border-slate-700 bg-slate-900 hover:bg-slate-800"><LogOut className="h-4 w-4" />登出</button>
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-7">
          <Stat icon={Building2} label="公司總數" value={data.stats.totalTenants} color="text-indigo-300" />
          <Stat icon={LayoutDashboard} label="ERP 公司" value={data.stats.erpCount} color="text-sky-300" />
          <Stat icon={ShoppingBag} label="POS 門市" value={data.stats.posCount} color="text-emerald-300" />
          <Stat icon={Store} label="電商租戶" value={data.stats.ecommerceCount} color="text-rose-300" />
          <Stat icon={Users} label="使用者" value={data.stats.totalUsers} color="text-violet-300" />
          <Stat icon={CheckCircle2} label="有效授權" value={data.stats.activeCount} color="text-amber-300" />
          <Stat icon={Mail} label="待聯絡需求" value={data.stats.pendingInquiryCount} color="text-rose-300" />
        </section>

        {data.inquiries.length > 0 && <InquiryQueue rows={data.inquiries} onChanged={load} />}

        <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
          <div className="flex flex-col gap-3 border-b border-slate-800 p-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex rounded-xl bg-slate-950 p-1">
              {(["ALL", "ERP", "POS", "ECOMMERCE"] as const).map((item) => (
                <button key={item} onClick={() => { setMode(item); setPage(1); }} className={`rounded-lg px-4 py-2 text-sm ${mode === item ? "bg-slate-700 text-white" : "text-slate-400 hover:text-white"}`}>
                  {item === "ALL" ? "全部" : item === "ERP" ? "一般企業 ERP" : item === "POS" ? "POS 門市" : "電商租戶"}
                </button>
              ))}
            </div>
            <form onSubmit={(event) => { event.preventDefault(); setSearch(query.trim()); setPage(1); }} className="flex gap-2">
              <label className="relative flex-1 lg:w-80">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜尋公司、帳號或信箱" className="h-10 w-full rounded-xl border border-slate-700 bg-slate-950 pl-9 pr-3 text-sm outline-none focus:border-indigo-400" />
              </label>
              <button className="rounded-xl bg-indigo-600 px-4 text-sm font-semibold hover:bg-indigo-500">搜尋</button>
            </form>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-slate-950/70 text-xs uppercase tracking-wide text-slate-500">
                <tr><th className="p-4">公司／方案</th><th className="p-4">系統</th><th className="p-4">管理帳號</th><th className="p-4">席次</th><th className="p-4">授權狀態</th><th className="p-4">使用量</th><th className="p-4 text-right">管理</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {loading ? (
                  <tr><td colSpan={7} className="p-16 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-indigo-300" /></td></tr>
                ) : data.rows.length === 0 ? (
                  <tr><td colSpan={7} className="p-16 text-center text-slate-500">找不到符合的公司</td></tr>
                ) : data.rows.map((tenant) => (
                  <tr key={tenant.id} className="hover:bg-white/[0.025]">
                    <td className="p-4"><div className="font-semibold text-white">{tenant.name}</div><div className="mt-1 text-xs text-slate-500">{tenant.license.planCode || "尚未選方案"}{tenant.connection.companyCode ? `・${tenant.connection.companyCode}` : ""}</div></td>
                    <td className="p-4"><ModeBadge mode={tenant.businessMode} /></td>
                    <td className="p-4"><div className="font-mono text-sky-300">{tenant.owner?.username || "—"}</div><div className="max-w-48 truncate text-xs text-slate-500">{tenant.owner?.email || ""}</div></td>
                    <td className="p-4"><div>{tenant.userCount} 個帳號</div><div className="text-xs text-slate-500">工作站 {tenant.deviceCount}/{tenant.license.seatLimit}・主機 {tenant.serverCount}/1</div></td>
                    <td className="p-4"><LicenseBadge license={tenant.license} /></td>
                    <td className="p-4 text-slate-300">{tenant.transactionCount.toLocaleString()} 筆交易</td>
                    <td className="p-4 text-right"><button onClick={() => setEditing(tenant)} className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-2 text-xs hover:border-indigo-400 hover:text-indigo-300"><KeyRound className="h-3.5 w-3.5" />授權與模式</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between border-t border-slate-800 p-4 text-sm text-slate-400">
            <span>共 {data.pagination.total} 家，第 {data.pagination.page}/{data.pagination.totalPages} 頁</span>
            <div className="flex gap-2">
              <button disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)} className="rounded-lg border border-slate-700 p-2 disabled:opacity-30"><ChevronLeft className="h-4 w-4" /></button>
              <button disabled={page >= data.pagination.totalPages || loading} onClick={() => setPage((value) => value + 1)} className="rounded-lg border border-slate-700 p-2 disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
            </div>
          </div>
        </section>
      </div>

      {editing && <LicenseDialog tenant={editing} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await load(); }} />}
      <style jsx global>{`.admin-button{display:inline-flex;align-items:center;gap:.4rem;border-radius:.75rem;padding:.65rem .9rem;font-size:.8rem;font-weight:600;transition:.15s}`}</style>
    </main>
  );
}

function LicenseDialog({ tenant, onClose, onSaved }: { tenant: TenantRow; onClose: () => void; onSaved: () => Promise<void> }) {
  const [planCode, setPlanCode] = useState<PlanCode>((tenant.license.planCode as PlanCode) || "TEAM_2");
  const [billing, setBilling] = useState<BillingCycle>((tenant.license.paymentType as BillingCycle) || "MONTHLY");
  const [mode, setMode] = useState<BusinessMode>(tenant.businessMode);
  const [rotateKey, setRotateKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [activationKey, setActivationKey] = useState<string | null>(null);
  const [companyCode, setCompanyCode] = useState(tenant.connection.companyCode || "");
  const [serverUrl, setServerUrl] = useState(tenant.connection.serverUrl || "");
  const [caCertificate, setCaCertificate] = useState("");
  const [discoveryEnabled, setDiscoveryEnabled] = useState(tenant.connection.enabled);
  const [connectionLoaded, setConnectionLoaded] = useState(false);
  const [paidAmount, setPaidAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"BANK_TRANSFER" | "CASH" | "OTHER">("BANK_TRANSFER");
  const [paymentReference, setPaymentReference] = useState("");
  const [paidAt, setPaidAt] = useState(() => toLocalDateTimeInput(new Date()));
  const [paymentNotes, setPaymentNotes] = useState("");
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [devices, setDevices] = useState<Array<{ id: string; deviceRole: "SERVER" | "WORKSTATION"; displayName: string | null; platform: string | null; appVersion: string | null; firstSeenAt: string; lastSeenAt: string; revokedAt: string | null }>>([]);
  const plan = PLAN_CATALOG.find((item) => item.code === planCode)!;
  const price = billing === "MONTHLY" ? plan.monthlyPrice : billing === "ANNUAL" ? plan.annualPrice : plan.lifetimePrice;

  useEffect(() => setPaidAmount(String(price)), [price]);

  useEffect(() => {
    fetch(`/api/admin/licenses/devices?tenantId=${encodeURIComponent(tenant.id)}`)
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("裝置載入失敗")))
      .then((result) => setDevices(result.rows || []))
      .catch(() => setDevices([]));
    fetch(`/api/admin/licenses/discovery?tenantId=${encodeURIComponent(tenant.id)}`)
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "自動連線設定載入失敗");
        setCompanyCode(result.companyCode || "");
        setServerUrl(result.discoveryServerUrl || "");
        setCaCertificate(result.discoveryCaCertificate || "");
        setDiscoveryEnabled(Boolean(result.discoveryEnabled));
      })
      .catch((error) => alert(error instanceof Error ? error.message : "自動連線設定載入失敗"))
      .finally(() => setConnectionLoaded(true));
  }, [tenant.id]);

  async function saveConnection(showSuccess = true) {
    const response = await fetch("/api/admin/licenses/discovery", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenantId: tenant.id,
        serverUrl: serverUrl.trim() || null,
        caCertificate: caCertificate.trim() || null,
        enabled: discoveryEnabled,
      }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "自動連線設定儲存失敗");
    setCompanyCode(result.companyCode || companyCode);
    if (showSuccess) alert("公司代碼與自動連線設定已儲存");
    return result;
  }

  async function saveConnectionOnly() {
    setBusy(true);
    try {
      await saveConnection(true);
    } catch (error) {
      alert(error instanceof Error ? error.message : "自動連線設定儲存失敗");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    try {
      const modeResponse = await fetch("/api/admin/tenants/mode", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tenantId: tenant.id, businessMode: mode }) });
      if (!modeResponse.ok) throw new Error((await modeResponse.json()).error || "模式更新失敗");
      await saveConnection(false);
      if (!paymentConfirmed) throw new Error("請先確認款項已實際入帳");
      const paymentDate = new Date(paidAt);
      if (Number.isNaN(paymentDate.getTime())) throw new Error("付款時間格式錯誤");
      const response = await fetch("/api/admin/licenses/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: tenant.id,
          planCode,
          billing,
          rotateKey,
          payment: {
            confirmation: "PAYMENT_RECEIVED",
            paidAmount: Number(paidAmount),
            paidAt: paymentDate.toISOString(),
            paymentMethod,
            paymentReference,
            notes: paymentNotes,
          },
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "開通失敗");
      if (result.companyCode) setCompanyCode(result.companyCode);
      if (result.activationKey) setActivationKey(result.activationKey);
      else await onSaved();
    } catch (error) {
      alert(error instanceof Error ? error.message : "開通失敗");
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    if (!confirm(`確定撤銷「${tenant.name}」授權？已登入裝置會在下次檢查時封鎖。`)) return;
    setBusy(true);
    try {
      const response = await fetch("/api/admin/licenses/revoke", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tenantId: tenant.id, confirmation: "REVOKE" }) });
      if (!response.ok) throw new Error((await response.json()).error || "撤銷失敗");
      await onSaved();
    } catch (error) {
      alert(error instanceof Error ? error.message : "撤銷失敗");
    } finally { setBusy(false); }
  }

  async function verify() {
    const response = await fetch("/api/admin/licenses/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tenantId: tenant.id }) });
    const result = await response.json();
    alert(result.valid
      ? `紀錄完整：授權 ${result.license.checked} 筆、付款 ${result.payments.checked} 筆、操作 ${result.records.checked} 筆`
      : `偵測到可能遭修改的紀錄。授權：${result.license.valid ? "正常" : "異常"}；付款：${result.payments.valid ? "正常" : "異常"}；操作：${result.records.valid ? "正常" : "異常"}`);
  }

  async function revokeDevice(deviceId: string) {
    if (!confirm("確定撤銷這台電腦？它必須重新取得有效席次才能使用。")) return;
    const response = await fetch("/api/admin/licenses/devices", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tenantId: tenant.id, deviceId }) });
    if (!response.ok) return alert((await response.json()).error || "撤銷失敗");
    setDevices((rows) => rows.map((row) => row.id === deviceId ? { ...row, revokedAt: new Date().toISOString() } : row));
  }

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
        <div className="flex items-start justify-between"><div><h2 className="text-xl font-bold">{tenant.name}</h2><p className="text-sm text-slate-400">公司模式與授權開通</p></div><button onClick={onClose} className="rounded-lg p-2 hover:bg-white/10"><X className="h-5 w-5" /></button></div>

        {activationKey ? (
          <div className="mt-6 rounded-xl border border-amber-400/30 bg-amber-400/10 p-5">
            <h3 className="font-bold text-amber-200">啟用碼只顯示這一次</h3>
            <div className="mt-3 rounded-lg bg-slate-950 p-3"><div className="text-xs text-slate-500">公司代碼</div><div className="mt-1 font-mono text-base font-bold text-sky-300">{companyCode || "產生中"}</div></div>
            <p className="mt-2 break-all rounded-lg bg-slate-950 p-4 font-mono text-sm text-white">{activationKey}</p>
            <div className="mt-4 flex gap-2"><button onClick={() => navigator.clipboard.writeText(`公司代碼：${companyCode}\n啟用碼：${activationKey}`)} className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-slate-950">複製公司代碼與啟用碼</button><button onClick={() => void onSaved()} className="rounded-lg border border-slate-600 px-4 py-2 text-sm">我已安全保存</button></div>
          </div>
        ) : (
          <>
            <div className="mt-5 grid gap-3 rounded-xl border border-slate-800 bg-slate-950/70 p-4 sm:grid-cols-2">
              <div><div className="text-xs text-slate-500">授權啟用日</div><div className="mt-1 text-sm font-semibold text-slate-200">{tenant.license.activatedAt ? new Date(tenant.license.activatedAt).toLocaleString("zh-TW") : "尚未開通"}</div></div>
              <div><div className="text-xs text-slate-500">授權到期日</div><div className="mt-1 text-sm font-semibold text-slate-200">{tenant.license.paymentType === "ONCE" ? "買斷，無租用到期日" : tenant.license.expiresAt ? new Date(tenant.license.expiresAt).toLocaleString("zh-TW") : "尚未設定"}</div></div>
            </div>
            <div className="mt-6 grid gap-5 md:grid-cols-2">
              <label className="space-y-2 text-sm"><span className="text-slate-400">公司業態（只能擇一）</span><select value={mode} onChange={(event) => setMode(event.target.value as BusinessMode)} className="h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3"><option value="ERP">一般企業進銷存會計</option><option value="ECOMMERCE">品牌電商網站＋ERP 營運後台</option><option value="POS_RETAIL">門市零售 POS＋進銷存＋會計</option><option value="POS_RESTAURANT">餐飲桌位／廚房＋進銷存＋會計</option></select></label>
              <label className="space-y-2 text-sm"><span className="text-slate-400">授權方案</span><select value={planCode} onChange={(event) => setPlanCode(event.target.value as PlanCode)} className="h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3">{PLAN_CATALOG.map((item) => <option key={item.code} value={item.code}>{item.name}（{item.seats} 台）</option>)}</select></label>
              <label className="space-y-2 text-sm"><span className="text-slate-400">付款週期</span><select value={billing} onChange={(event) => setBilling(event.target.value as BillingCycle)} className="h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3"><option value="MONTHLY">月租</option><option value="ANNUAL">年租（收 10 個月）</option><option value="ONCE">一次買斷</option></select></label>
              <div className="rounded-xl bg-slate-950 p-4"><div className="text-xs text-slate-500">本次方案金額</div><div className="mt-1 text-xl font-bold text-emerald-300">{formatTwd(price)}</div><div className="mt-1 text-xs text-slate-500">上限 {plan.seats} 台電腦</div></div>
            </div>
            {tenant.payments.length > 0 && <div className="mt-5 rounded-xl border border-slate-800 bg-slate-950/70 p-4">
              <h3 className="text-sm font-semibold">最近付款紀錄</h3>
              <div className="mt-3 space-y-2">{tenant.payments.map((payment) => <div key={payment.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-900 p-3 text-xs"><div><span className="font-mono text-sky-300">{payment.paymentReference}</span><span className="ml-2 text-slate-500">{payment.paymentMethod === "BANK_TRANSFER" ? "銀行轉帳" : payment.paymentMethod === "CASH" ? "現金" : "其他"}</span></div><div className="text-right"><div className="font-semibold text-emerald-300">{formatTwd(Number(payment.paidAmount))}</div><div className="text-slate-500">{new Date(payment.paidAt).toLocaleString("zh-TW")}</div></div></div>)}</div>
            </div>}
            <div className="mt-5 rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-4">
              <h3 className="text-sm font-semibold text-emerald-100">人工付款確認</h3>
              <p className="mt-1 text-xs leading-5 text-slate-400">開通後會建立防竄改付款紀錄。續約會從原到期日接續，不會吃掉客戶尚未用完的天數。</p>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <label className="space-y-1 text-xs text-slate-400"><span>實收金額（TWD）</span><input type="number" min="1" step="1" value={paidAmount} onChange={(event) => setPaidAmount(event.target.value)} className="h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-white" /></label>
                <label className="space-y-1 text-xs text-slate-400"><span>付款方式</span><select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as typeof paymentMethod)} className="h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-white"><option value="BANK_TRANSFER">銀行轉帳</option><option value="CASH">現金</option><option value="OTHER">其他</option></select></label>
                <label className="space-y-1 text-xs text-slate-400"><span>付款參考編號</span><input value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} placeholder="例如：日期＋匯款末五碼" maxLength={100} className="h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-white" /></label>
                <label className="space-y-1 text-xs text-slate-400"><span>實際入帳時間</span><input type="datetime-local" value={paidAt} onChange={(event) => setPaidAt(event.target.value)} className="h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-white" /></label>
                <label className="space-y-1 text-xs text-slate-400 md:col-span-2"><span>備註（選填）</span><textarea value={paymentNotes} onChange={(event) => setPaymentNotes(event.target.value)} maxLength={500} rows={2} className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-sm text-white" /></label>
              </div>
              <label className="mt-4 flex items-start gap-2 text-sm text-emerald-100"><input type="checkbox" checked={paymentConfirmed} onChange={(event) => setPaymentConfirmed(event.target.checked)} className="mt-1" /><span>我已向付款平台／銀行核對，確認款項確實入帳，並同意以此資料開通。</span></label>
            </div>
            <label className="mt-5 flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={rotateKey} onChange={(event) => setRotateKey(event.target.checked)} />重發啟用碼（舊安裝需重新連線驗證）</label>
            <div className="mt-5 rounded-xl border border-sky-400/20 bg-sky-400/5 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-sm font-semibold text-sky-100">公司代碼自動連線</h3><p className="mt-1 text-xs text-slate-400">客戶輸入公司代碼與啟用碼後，由中央簽章回傳此主機網址與公開 CA 憑證。</p></div><span className="rounded-lg bg-slate-950 px-3 py-2 font-mono text-sm text-sky-300">{companyCode || (connectionLoaded ? "尚未產生" : "載入中…")}</span></div>
              <div className="mt-4 grid gap-3">
                <label className="space-y-1 text-xs text-slate-400"><span>公司主機 HTTPS 網址</span><input value={serverUrl} onChange={(event) => setServerUrl(event.target.value)} placeholder="https://192.168.1.20:3443" className="h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-white" /></label>
                <label className="space-y-1 text-xs text-slate-400"><span>公司主機 CA 憑證（ca.crt 公開內容）</span><textarea value={caCertificate} onChange={(event) => setCaCertificate(event.target.value)} placeholder="-----BEGIN CERTIFICATE-----" rows={4} className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3 font-mono text-xs text-white" /></label>
                <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={discoveryEnabled} onChange={(event) => setDiscoveryEnabled(event.target.checked)} />允許客戶用公司代碼自動取得連線設定</label>
                <div><button disabled={busy || !connectionLoaded} onClick={() => void saveConnectionOnly()} className="rounded-lg border border-sky-400/30 px-3 py-2 text-xs text-sky-200 hover:bg-sky-400/10 disabled:opacity-40">只儲存自動連線設定</button></div>
              </div>
            </div>
            <ModeDemoPreview mode={mode} companyCode={companyCode} />
            <div className="mt-5 rounded-xl border border-slate-800 bg-slate-950/70 p-4">
              <div className="flex items-center justify-between"><h3 className="text-sm font-semibold">已綁定主機與工作站</h3><span className="text-xs text-slate-500">工作站 {devices.filter((device) => !device.revokedAt && device.deviceRole === "WORKSTATION").length}/{tenant.license.seatLimit}・主機 {devices.filter((device) => !device.revokedAt && device.deviceRole === "SERVER").length}/1</span></div>
              <div className="mt-3 space-y-2">
                {devices.length === 0 ? <p className="text-xs text-slate-500">尚無電腦使用啟用碼連線</p> : devices.map((device) => <div key={device.id} className="flex items-center justify-between gap-3 rounded-lg bg-slate-900 p-3 text-xs"><div className="min-w-0"><div className="truncate font-medium text-slate-200">{device.deviceRole === "SERVER" ? "公司主機" : "操作工作站"}・{device.displayName || "未命名電腦"}・{device.platform || "未知系統"}</div><div className="mt-1 text-slate-500">首次連線 {new Date(device.firstSeenAt).toLocaleString("zh-TW")}・最後連線 {new Date(device.lastSeenAt).toLocaleString("zh-TW")}{device.revokedAt ? "・已撤銷" : ""}</div></div>{!device.revokedAt && <button onClick={() => void revokeDevice(device.id)} className="shrink-0 rounded-lg border border-rose-500/30 px-2 py-1 text-rose-300 hover:bg-rose-500/10">撤銷</button>}</div>)}
              </div>
            </div>
            <div className="mt-7 flex flex-wrap justify-between gap-2"><div className="flex gap-2"><button disabled={busy || !paymentConfirmed || !paymentReference.trim() || Number(paidAmount) <= 0} onClick={save} className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold hover:bg-indigo-500 disabled:opacity-50">{busy ? "處理中…" : "確認付款後開通"}</button><button onClick={verify} className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm hover:bg-white/5">驗證防竄改紀錄</button></div><button disabled={busy} onClick={revoke} className="rounded-xl border border-rose-500/40 px-4 py-2.5 text-sm text-rose-300 hover:bg-rose-500/10">撤銷授權</button></div>
          </>
        )}
      </div>
    </div>
  );
}

function ModeDemoPreview({ mode, companyCode }: { mode: BusinessMode; companyCode: string }) {
  const demos: Record<BusinessMode, { title: string; description: string; detail: ReactNode; video: string; poster: string; icon: typeof Store }> = {
    ERP: {
      title: "一般企業 ERP 操作示範",
      description: "從商品與庫存，到採購、銷售、出貨、應收應付與會計傳票的完整流程。",
      detail: <>租戶登入後只會看到獲授權的 ERP 模組；資料依公司隔離並由安裝於公司電腦的主機保存。</>,
      video: "/videos/erp-demo.webm",
      poster: "/images/demos/erp-demo.png",
      icon: MonitorSmartphone,
    },
    ECOMMERCE: {
      title: "電商商城＋ERP 雙視角示範",
      description: "一般消費者在品牌商城下單；租戶管理者回到 ERP 接單、保留庫存、出貨並銜接帳務。",
      detail: <>儲存後自動建立 <span className="font-mono text-sky-300">/store/{companyCode || "公司代碼"}</span>。租戶共用高速版型，但商品、客戶、庫存與訂單完全隔離。</>,
      video: "/videos/ecommerce-erp-demo.webm",
      poster: "/images/demos/ecommerce-erp-demo.png",
      icon: Store,
    },
    POS_RETAIL: {
      title: "零售 POS 操作示範",
      description: "快速選品／掃碼、會員促銷、購物車、多元付款、暫存單、退換貨與日結。",
      detail: <>POS 前台與 ERP 商品、庫存、會員及銷售資料使用同一租戶帳套，完成交易後可直接追蹤庫存與報表。</>,
      video: "/videos/retail-pos-demo.webm",
      poster: "/images/demos/retail-pos-demo.png",
      icon: ShoppingBag,
    },
    POS_RESTAURANT: {
      title: "餐飲 POS 操作示範",
      description: "桌位狀態、圖片點餐、加點、送廚、廚房看板、出餐與桌位結帳。",
      detail: <>以顏色區分桌況，點餐資訊同步廚房；結帳後連動租戶庫存、會員、營收與分析報表。</>,
      video: "/videos/restaurant-pos-demo.webm",
      poster: "/images/demos/restaurant-pos-demo.png",
      icon: UtensilsCrossed,
    },
  };
  const demo = demos[mode];
  const Icon = demo.icon;
  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-indigo-400/20 bg-indigo-400/5">
      <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(300px,.8fr)] lg:items-center">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-indigo-100"><Icon className="h-4 w-4" />{demo.title}</div>
          <p className="mt-2 text-xs leading-6 text-slate-300">{demo.description}</p>
          <div className="mt-3 rounded-lg border border-white/10 bg-slate-950/50 p-3 text-xs leading-5 text-slate-300">{demo.detail}</div>
          <p className="mt-3 text-[11px] text-slate-500">選擇模式即可觀看；正式開通後租戶管理者也能在自己的工作區查看對應操作入口。</p>
        </div>
        <video controls preload="metadata" playsInline poster={demo.poster} className="aspect-video w-full rounded-lg border border-white/10 bg-black object-cover shadow-2xl">
          <source src={demo.video} type="video/webm" />
          您的瀏覽器不支援影片播放。
        </video>
      </div>
    </div>
  );
}
function InquiryQueue({ rows, onChanged }: { rows: AdminData["inquiries"]; onChanged: () => Promise<void> }) {
  const [busyId, setBusyId] = useState<string | null>(null);
  async function mark(id: string, status: "CONTACTED" | "CLOSED") {
    setBusyId(id);
    try {
      const response = await fetch(`/api/admin/inquiries/${encodeURIComponent(id)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
      if (!response.ok) throw new Error((await response.json()).error || "更新失敗");
      await onChanged();
    } catch (error) {
      alert(error instanceof Error ? error.message : "更新失敗");
    } finally { setBusyId(null); }
  }
  return <section className="rounded-2xl border border-rose-400/20 bg-slate-900 p-4">
    <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-rose-300" /><h2 className="font-semibold">待聯絡方案需求</h2><span className="text-xs text-slate-500">最新 {rows.length} 筆</span></div>
    <div className="mt-4 grid gap-3 lg:grid-cols-2">
      {rows.map((row) => {
        const plan = PLAN_CATALOG.find((item) => item.code === row.planCode);
        return <article key={row.id} className="rounded-xl border border-slate-800 bg-slate-950 p-4 text-sm">
          <div className="flex items-start justify-between gap-3"><div><div className="font-semibold text-white">{row.company}</div><div className="mt-1 text-xs text-slate-500">{row.name}・{getProductEdition(row.businessMode).shortLabel}・{plan?.name || row.planCode}・{row.billing === "MONTHLY" ? "月租" : row.billing === "ANNUAL" ? "年租" : "買斷"}</div></div><span className={`rounded-full px-2 py-1 text-[10px] ${row.notificationStatus === "SENT" ? "bg-emerald-400/10 text-emerald-300" : "bg-amber-400/10 text-amber-300"}`}>{row.notificationStatus === "SENT" ? "已寄通知" : "後台已保留"}</span></div>
          <div className="mt-3 flex flex-wrap gap-3 text-xs"><a href={`mailto:${row.email}`} className="text-sky-300 hover:underline">{row.email}</a>{row.lineId && <span className="text-slate-400">Line：{row.lineId}</span>}</div>
          {row.notes && <p className="mt-3 line-clamp-3 text-xs leading-5 text-slate-400">{row.notes}</p>}
          <div className="mt-3 flex items-center justify-between"><span className="text-[11px] text-slate-600">{new Date(row.createdAt).toLocaleString("zh-TW")}</span><div className="flex gap-2"><button disabled={busyId === row.id} onClick={() => void mark(row.id, "CONTACTED")} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold disabled:opacity-50">標記已聯絡</button><button disabled={busyId === row.id} onClick={() => void mark(row.id, "CLOSED")} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs disabled:opacity-50">結案</button></div></div>
        </article>;
      })}
    </div>
  </section>;
}

function toLocalDateTimeInput(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function LoadingScreen() { return <div className="flex min-h-screen items-center justify-center bg-slate-950"><Loader2 className="h-8 w-8 animate-spin text-indigo-300" /></div>; }

function Stat({ icon: Icon, label, value, color }: { icon: typeof Building2; label: string; value: number; color: string }) {
  return <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4"><div className="flex items-center gap-2 text-xs text-slate-500"><Icon className="h-4 w-4" />{label}</div><div className={`mt-2 text-3xl font-bold ${color}`}>{value.toLocaleString()}</div></div>;
}

function ModeBadge({ mode }: { mode: BusinessMode }) {
  const edition = getProductEdition(mode);
  const isRestaurant = mode === "POS_RESTAURANT";
  const isCommerce = mode === "ECOMMERCE";
  const isPos = mode === "POS_RETAIL";
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${isCommerce ? "bg-rose-400/10 text-rose-300" : isRestaurant ? "bg-orange-400/10 text-orange-300" : isPos ? "bg-emerald-400/10 text-emerald-300" : "bg-sky-400/10 text-sky-300"}`}>{isCommerce ? <Store className="h-3 w-3" /> : isRestaurant ? <UtensilsCrossed className="h-3 w-3" /> : isPos ? <ShoppingBag className="h-3 w-3" /> : <MonitorSmartphone className="h-3 w-3" />}{edition.shortLabel}</span>;
}

function LicenseBadge({ license }: { license: TenantRow["license"] }) {
  const styles = license.status === "paid" ? "bg-emerald-400/10 text-emerald-300" : license.status === "trial" ? "bg-amber-400/10 text-amber-300" : "bg-rose-400/10 text-rose-300";
  const label = license.status === "paid" ? (license.paymentType === "ONCE" ? "買斷已開通" : "租用有效") : license.status === "trial" ? "3 日試用" : license.status === "expired" ? "試用到期" : "已封鎖";
  return <div><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${styles}`}>{label}</span>{license.activatedAt && <div className="mt-1 text-[11px] text-slate-500">啟用 {new Date(license.activatedAt).toLocaleDateString("zh-TW")}</div>}{license.paymentType === "ONCE" && license.activatedAt ? <div className="text-[11px] text-slate-500">買斷無到期日</div> : license.expiresAt ? <div className="text-[11px] text-slate-500">到期 {new Date(license.expiresAt).toLocaleDateString("zh-TW")}</div> : null}</div>;
}
