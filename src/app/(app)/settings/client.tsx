"use client";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Download, Database, AlertTriangle, Loader2, Mail, MonitorCog, Plus, Store, RefreshCw, ShieldCheck, Copy, ExternalLink, Globe2 } from "lucide-react";

export function SettingsClient() {
  const [form, setForm] = useState<any>({ name: "", currency: "TWD", smtpSecure: true, smtpPort: 465 });
  const [businessMode, setBusinessMode] = useState("");
  const [storefrontUrl, setStorefrontUrl] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    fetch("/api/settings").then((r) => r.json()).then((d) => {
      setForm({
        name: "",
        currency: "TWD",
        smtpSecure: true,
        smtpPort: 465,
        ...(d.company ?? {}),
        smtpPassword: "",
      });
      setBusinessMode(d.businessMode ?? "");
      setStorefrontUrl(d.storefrontUrl ?? "");
    });
  }, []);
  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "儲存失敗");
      if (result.company) setForm((current: any) => ({ ...current, ...result.company, smtpPassword: "" }));
      if (result.storefrontUrl) setStorefrontUrl(result.storefrontUrl);
      toast.success("已儲存");
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  }
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>公司基本資料</CardTitle>
          <CardDescription>公司更名會同步到授權、公司主機與工作站；租戶、資料、啟用碼及安裝程式都不會更換。公司業態如需變更，請由平台管理者先檢查影響後執行保留資料轉換。</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 max-w-3xl">
          <div className="space-y-1 col-span-2"><Label>公司名稱 *</Label><Input value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="space-y-1"><Label>統一編號</Label><Input value={form.taxId ?? ""} onChange={(e) => setForm({ ...form, taxId: e.target.value })} /></div>
          <div className="space-y-1"><Label>電話</Label><Input value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div className="space-y-1 col-span-2"><Label>Email</Label><Input value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div className="space-y-1 col-span-2"><Label>地址</Label><Input value={form.address ?? ""} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
          <div className="space-y-1"><Label>幣別</Label><Input value={form.currency ?? "TWD"} onChange={(e) => setForm({ ...form, currency: e.target.value })} /></div>
          <div className="space-y-1"><Label>Logo 網址</Label><Input value={form.logoUrl ?? ""} onChange={(e) => setForm({ ...form, logoUrl: e.target.value })} /></div>
          <div className="col-span-2"><Button onClick={save} disabled={saving}>{saving ? "儲存中..." : "儲存"}</Button></div>
        </CardContent>
      </Card>
      {businessMode === "ECOMMERCE" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Store className="h-5 w-5" />商城名稱與專屬網址</CardTitle>
            <CardDescription>商城品牌名稱與 ERP 公司名稱分開設定；沒有自訂網域也會保有可直接分享給消費者的專屬商城網址。</CardDescription>
          </CardHeader>
          <CardContent className="max-w-3xl space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1"><Label>商城名稱 *</Label><Input value={form.storeName ?? ""} onChange={(e) => setForm({ ...form, storeName: e.target.value })} placeholder={form.name || "我的品牌商城"} /></div>
              <div className="space-y-1"><Label>商城網址代碼 *</Label><Input value={form.storeSlug ?? ""} onChange={(e) => setForm({ ...form, storeSlug: e.target.value.toLowerCase() })} placeholder="my-brand" /></div>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950">
              <div className="flex items-center gap-2 text-sm font-semibold"><Globe2 className="h-4 w-4" />目前商城網址</div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <a href={storefrontUrl || "#"} target="_blank" rel="noreferrer" className="min-w-0 break-all font-mono text-sm text-emerald-800 underline">{storefrontUrl || "儲存後產生專屬網址"}</a>
                {storefrontUrl && <Button type="button" size="sm" variant="outline" onClick={async () => { await navigator.clipboard.writeText(storefrontUrl); toast.success("商城網址已複製"); }}><Copy className="h-4 w-4" />複製</Button>}
                {storefrontUrl && <Button type="button" size="sm" variant="outline" asChild><a href={storefrontUrl} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" />開啟商城</a></Button>}
              </div>
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
              如需使用自己的品牌網域，電商月租與年租方案另收一次設定費 NT$1,500；網域購買與續費由客戶自行支付。未設定自訂網域不影響上述專屬商城網址使用。
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-sm font-bold text-slate-900">商城銀行轉帳資訊</div>
              <p className="mt-1 text-xs leading-5 text-slate-600">填寫後，選擇銀行轉帳的顧客會在訂單成立頁看到匯款資訊。請只填寫專門對外收款的帳戶。</p>
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <div className="space-y-1"><Label>銀行名稱</Label><Input value={form.storeTransferBankName ?? ""} onChange={(e) => setForm({ ...form, storeTransferBankName: e.target.value })} placeholder="例如：○○銀行" /></div>
                <div className="space-y-1"><Label>戶名</Label><Input value={form.storeTransferAccountName ?? ""} onChange={(e) => setForm({ ...form, storeTransferAccountName: e.target.value })} placeholder="公司或品牌戶名" /></div>
                <div className="space-y-1"><Label>匯款帳號</Label><Input value={form.storeTransferAccountNumber ?? ""} onChange={(e) => setForm({ ...form, storeTransferAccountNumber: e.target.value })} placeholder="請輸入對外收款帳號" /></div>
              </div>
            </div>
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs leading-5 text-rose-900">
              信用卡與行動支付目前只提供結帳與 ERP 接單流程體驗，不會實際扣款；正式收款需由客戶提供金流商帳號及串接資料後開通。
            </div>
            <Button onClick={save} disabled={saving}>{saving ? "儲存中..." : "儲存商城設定"}</Button>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Mail className="h-5 w-5" />SMTP 寄件設定</CardTitle>
          <CardDescription>AI 助手寄送 Excel、Word、PDF 報表時，會使用此租戶自己的寄件信箱。</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 max-w-3xl">
          <div className="space-y-1 col-span-2 md:col-span-1">
            <Label>SMTP 主機</Label>
            <Input placeholder="smtp.gmail.com" value={form.smtpHost ?? ""} onChange={(e) => setForm({ ...form, smtpHost: e.target.value })} />
          </div>
          <div className="space-y-1 col-span-2 md:col-span-1">
            <Label>SMTP Port</Label>
            <Input type="number" placeholder="465 或 587" value={form.smtpPort ?? ""} onChange={(e) => setForm({ ...form, smtpPort: e.target.value })} />
          </div>
          <div className="space-y-1 col-span-2 md:col-span-1">
            <Label>SMTP 帳號</Label>
            <Input value={form.smtpUser ?? ""} onChange={(e) => setForm({ ...form, smtpUser: e.target.value })} />
          </div>
          <div className="space-y-1 col-span-2 md:col-span-1">
            <Label>SMTP 密碼 / 應用程式密碼</Label>
            <Input
              type="password"
              placeholder={form.hasSmtpPassword ? "已設定，留空則不變更" : "請輸入密碼"}
              value={form.smtpPassword ?? ""}
              onChange={(e) => setForm({ ...form, smtpPassword: e.target.value })}
            />
          </div>
          <div className="space-y-1 col-span-2 md:col-span-1">
            <Label>寄件者名稱</Label>
            <Input placeholder={form.name || "ERP AI 資料助手"} value={form.smtpFromName ?? ""} onChange={(e) => setForm({ ...form, smtpFromName: e.target.value })} />
          </div>
          <div className="space-y-1 col-span-2 md:col-span-1">
            <Label>寄件者 Email</Label>
            <Input type="email" placeholder={form.email || "sender@example.com"} value={form.smtpFromEmail ?? ""} onChange={(e) => setForm({ ...form, smtpFromEmail: e.target.value })} />
          </div>
          <label className="col-span-2 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.smtpSecure !== false}
              onChange={(e) => setForm({ ...form, smtpSecure: e.target.checked })}
              className="h-4 w-4 rounded border-input"
            />
            使用 SSL/TLS 安全連線
          </label>
          <div className="col-span-2 space-y-3 rounded-md border bg-muted/30 p-4 text-xs text-muted-foreground">
            <div className="font-semibold text-foreground">操作指引</div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <div className="font-medium text-foreground">1. 先準備寄件信箱</div>
                <p>可使用公司網域信箱、Gmail、Outlook / Microsoft 365，或另外申請一個專門寄 ERP 報表的信箱。寄件者 Email 建議與 SMTP 帳號相同，避免被收件端判定為冒用。</p>
              </div>
              <div className="space-y-1">
                <div className="font-medium text-foreground">2. Gmail 常用填法</div>
                <p>Google 帳戶需先開啟兩步驟驗證，再產生「應用程式密碼」。SMTP 主機填 smtp.gmail.com，Port 465 勾選 SSL/TLS；或 Port 587 不勾選 SSL/TLS。</p>
              </div>
              <div className="space-y-1">
                <div className="font-medium text-foreground">3. Outlook / Microsoft 365 常用填法</div>
                <p>SMTP 主機通常為 smtp.office365.com，Port 587，不勾選 SSL/TLS。若公司停用 SMTP AUTH，需請管理員到 Microsoft 365 管理中心開啟。</p>
              </div>
              <div className="space-y-1">
                <div className="font-medium text-foreground">4. 公司網域信箱</div>
                <p>請向主機商或資訊人員取得 SMTP 主機、Port、安全連線方式、帳號與密碼。若提供 Port 465 通常勾選 SSL/TLS；Port 587 通常不勾選。</p>
              </div>
            </div>
            <div className="rounded border bg-background px-3 py-2">
              沒有設定 SMTP 時，AI 助手不會用共用 Gmail 代寄；每個租戶都需要設定自己的寄件信箱或應用程式密碼。
            </div>
          </div>
          <div className="col-span-2"><Button onClick={save} disabled={saving}>{saving ? "儲存中..." : "儲存 SMTP 設定"}</Button></div>
        </CardContent>
      </Card>
      <PosRegisterCard />
      <UpdateCenterCard />
      <BackupCard />
    </div>
  );
}

type UpdateModel = {
  localHost: boolean;
  updaterReady?: boolean;
  currentVersion?: string;
  latestVersion?: string | null;
  updateAvailable?: boolean;
  publishedAt?: string;
  checkError?: string;
  status?: { state: string; message: string; fromVersion?: string; toVersion?: string; updatedAt?: string };
};

function displayVersion(value?: string | null) {
  if (!value) return "—";
  return /^[a-f0-9]{12,}$/i.test(value) ? value.slice(0, 12) : value;
}

function UpdateCenterCard() {
  const [model, setModel] = useState<UpdateModel | null>(null);
  const [checking, setChecking] = useState(true);
  const [updating, setUpdating] = useState(false);

  async function load(silent = false) {
    if (!silent) setChecking(true);
    try {
      const response = await fetch("/api/system/update", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 403) return setModel(null);
        throw new Error(result.error || "無法查詢更新");
      }
      setModel(result);
      return result as UpdateModel;
    } catch (error) {
      if (!silent) toast.error(error instanceof Error ? error.message : "無法查詢更新");
      return null;
    } finally {
      if (!silent) setChecking(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function backupAndUpdate() {
    if (!window.confirm("系統會先建立加密完整備份，再重新啟動 ERP 約 1–5 分鐘。現在執行嗎？")) return;
    setUpdating(true);
    try {
      const response = await fetch("/api/system/update", { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "無法啟動更新");
      toast.success("更新前加密備份已完成，背景更新已開始");
      const deadline = Date.now() + 8 * 60_000;
      while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 5_000));
        const next = await load(true);
        if (!next) continue;
        if (["healthy", "current"].includes(next.status?.state || "") && !next.updateAvailable) {
          toast.success("艾琳 ERP 已更新完成並通過健康檢查");
          setUpdating(false);
          return;
        }
        if (["rolled_back", "failed"].includes(next.status?.state || "")) {
          throw new Error(next.status?.message || "更新未完成");
        }
      }
      throw new Error("更新仍在背景執行，請稍後按「重新檢查」確認結果");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "更新失敗");
    } finally {
      setUpdating(false);
    }
  }

  if (!model?.localHost) return null;
  const busyState = ["queued", "pulling", "restarting", "rolling_back"].includes(model.status?.state || "");
  const busy = updating || busyState;

  return (
    <>
      {busy && (
        <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black/65 px-6 text-center backdrop-blur-sm">
          <Loader2 className="mb-4 h-12 w-12 animate-spin text-white" />
          <div className="text-xl font-semibold text-white">{model.status?.message || "正在安全更新艾琳 ERP…"}</div>
          <div className="mt-2 text-sm text-white/70">請保持 Docker Desktop 與電腦電源開啟；ERP 重新連線後會自動顯示結果。</div>
        </div>
      )}
      <Card id="system-update">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><RefreshCw className="h-5 w-5" />系統更新中心</CardTitle>
          <CardDescription>公司主機、工作站授權與中央版本維持綁定；功能更新不會清除資料庫，也不需要重新安裝公司主機。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border bg-muted/20 p-4"><div className="text-xs text-muted-foreground">目前公司主機版本</div><div className="mt-1 font-mono font-semibold">{displayVersion(model.currentVersion)}</div></div>
            <div className="rounded-lg border bg-muted/20 p-4"><div className="text-xs text-muted-foreground">中央最新版本</div><div className="mt-1 font-mono font-semibold">{displayVersion(model.latestVersion)}</div></div>
            <div className="rounded-lg border bg-muted/20 p-4"><div className="text-xs text-muted-foreground">狀態</div><div className="mt-1 font-semibold">{model.updateAvailable ? "有新版可更新" : model.checkError ? "中央版本暫時無法查詢" : "已是最新版本"}</div></div>
          </div>
          {model.status?.message && model.status.state !== "idle" && (
            <div className={`rounded-md border p-3 text-sm ${model.status.state === "rolled_back" || model.status.state === "failed" ? "border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-100" : "bg-muted/30"}`}>
              {model.status.message}
            </div>
          )}
          {model.checkError && <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">{model.checkError}</div>}
          {!model.updaterReady && <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">需先執行新版 Host 安裝包一次以安裝背景更新服務；既有資料、帳號、密碼與授權都會保留。完成後往後直接在此更新。</div>}
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void backupAndUpdate()} disabled={busy || checking || !model.updaterReady || Boolean(model.checkError)}>
              <ShieldCheck className="h-4 w-4" />{busy ? "更新中…" : model.updateAvailable ? "備份並更新" : "備份並檢查更新"}
            </Button>
            <Button variant="outline" onClick={() => void load()} disabled={busy || checking}><RefreshCw className={`h-4 w-4 ${checking ? "animate-spin" : ""}`} />重新檢查</Button>
          </div>
          <p className="text-xs text-muted-foreground">流程：加密完整備份 → 下載新版 → 重新啟動 → 健康檢查；若檢查失敗會自動恢復舊版。</p>
        </CardContent>
      </Card>
    </>
  );
}

type RegisterRow = {
  id: string;
  code: string;
  name: string;
  warehouseId: string;
  isActive: boolean;
  warehouse: { id: string; code: string; name: string };
  _count: { shifts: number; sales: number };
};

function PosRegisterCard() {
  const [registers, setRegisters] = useState<RegisterRow[]>([]);
  const [warehouses, setWarehouses] = useState<Array<{ id: string; code: string; name: string }>>([]);
  const [form, setForm] = useState({ id: "", code: "", name: "", warehouseId: "", isActive: true });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/pos/registers", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "收銀台載入失敗");
      setRegisters(data.registers ?? []);
      setWarehouses(data.warehouses ?? []);
      setForm((current) => ({ ...current, warehouseId: current.warehouseId || data.warehouses?.[0]?.id || "" }));
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  function resetForm() {
    setForm({ id: "", code: "", name: "", warehouseId: warehouses[0]?.id || "", isActive: true });
  }

  async function saveRegister(next = form) {
    if (!next.code.trim() || !next.name.trim() || !next.warehouseId) return toast.error("請完整填寫收銀台代碼、名稱與倉庫");
    setSaving(true);
    try {
      const res = await fetch("/api/pos/registers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "收銀台儲存失敗");
      toast.success(next.id ? "收銀台已更新" : "收銀台已建立");
      resetForm();
      await load();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><MonitorCog className="h-5 w-5" />POS 收銀台與門市倉庫</CardTitle>
        <CardDescription>每台收銀台綁定一個出貨倉庫；開班、銷售、退貨及結班都依此追蹤。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 rounded-lg border bg-muted/20 p-4 md:grid-cols-4">
          <div className="space-y-1"><Label>收銀台代碼</Label><Input placeholder="POS01" value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })} /></div>
          <div className="space-y-1"><Label>顯示名稱</Label><Input placeholder="第一收銀台" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></div>
          <div className="space-y-1"><Label>門市／出貨倉庫</Label><select value={form.warehouseId} onChange={(event) => setForm({ ...form, warehouseId: event.target.value })} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.code} · {warehouse.name}</option>)}</select></div>
          <div className="flex items-end gap-2"><Button onClick={() => void saveRegister()} disabled={saving || warehouses.length === 0}><Plus className="h-4 w-4" />{form.id ? "儲存修改" : "新增收銀台"}</Button>{form.id && <Button variant="outline" onClick={resetForm}>取消</Button>}</div>
        </div>
        {warehouses.length === 0 && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">請先在「倉庫／門市」建立至少一個有效倉庫。</div>}
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-muted/50"><tr><th className="p-3 text-left">代碼</th><th className="p-3 text-left">收銀台</th><th className="p-3 text-left">出貨倉庫</th><th className="p-3 text-right">班次／交易</th><th className="p-3 text-left">狀態</th><th className="p-3 text-right">操作</th></tr></thead>
            <tbody>
              {registers.map((register) => <tr key={register.id} className="border-t"><td className="p-3 font-mono">{register.code}</td><td className="p-3"><span className="inline-flex items-center gap-2"><Store className="h-4 w-4 text-muted-foreground" />{register.name}</span></td><td className="p-3">{register.warehouse.code} · {register.warehouse.name}</td><td className="p-3 text-right">{register._count.shifts}／{register._count.sales}</td><td className="p-3">{register.isActive ? "啟用" : "停用"}</td><td className="p-3 text-right space-x-2"><Button size="sm" variant="outline" onClick={() => setForm({ id: register.id, code: register.code, name: register.name, warehouseId: register.warehouseId, isActive: register.isActive })}>編輯</Button><Button size="sm" variant="outline" disabled={saving} onClick={() => void saveRegister({ id: register.id, code: register.code, name: register.name, warehouseId: register.warehouseId, isActive: !register.isActive })}>{register.isActive ? "停用" : "啟用"}</Button></td></tr>)}
              {!loading && registers.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">尚未建立收銀台</td></tr>}
              {loading && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">載入中…</td></tr>}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function BackupCard() {
  type BackupFile = { name: string; size: number; createdAt: string; sha256: string | null };
  const [backing, setBacking] = useState(false);
  const [loading, setLoading] = useState(true);
  const [files, setFiles] = useState<BackupFile[]>([]);
  const [unavailable, setUnavailable] = useState("");

  async function loadBackups() {
    setLoading(true);
    try {
      const res = await fetch("/api/system/backup", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "無法讀取備份清單");
      setFiles(Array.isArray(data.files) ? data.files : []);
      setUnavailable("");
    } catch (error) {
      setFiles([]);
      setUnavailable(error instanceof Error ? error.message : "無法讀取備份清單");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadBackups(); }, []);

  async function doBackup() {
    setBacking(true);
    try {
      const res = await fetch("/api/system/backup", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "備份失敗");
      toast.success("加密資料庫備份已建立並通過完整性雜湊");
      await loadBackups();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "備份失敗");
    } finally {
      setBacking(false);
    }
  }

  function formatBytes(value: number) {
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${(value / 1024 / 1024).toFixed(1)} MB`;
  }

  return (
    <>
      {backing && (
        <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm">
          <Loader2 className="h-12 w-12 animate-spin text-white mb-4" />
          <div className="text-white text-xl font-semibold">備份作業中，請稍候...</div>
          <div className="text-white/70 text-sm mt-2">正在建立 PostgreSQL 完整備份並加密驗證</div>
        </div>
      )}
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Database className="h-5 w-5" />系統備份與還原</CardTitle>
        <CardDescription>公司主機每 24 小時自動建立一次完整加密備份，預設保留 30 日；也可由授權管理者立即建立。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={doBackup} disabled={backing || Boolean(unavailable)}>
            <Database className="h-4 w-4" />{backing ? "備份中..." : "立即建立加密備份"}
          </Button>
          <Button variant="outline" onClick={() => void loadBackups()} disabled={loading || backing}>重新整理清單</Button>
        </div>
        {unavailable && <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">{unavailable}</div>}
        {!unavailable && (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-muted/50"><tr><th className="p-3 text-left">建立時間</th><th className="p-3 text-left">備份檔</th><th className="p-3 text-right">大小</th><th className="p-3 text-left">SHA-256</th><th className="p-3 text-right">操作</th></tr></thead>
              <tbody>
                {files.map((file) => (
                  <tr key={file.name} className="border-t">
                    <td className="whitespace-nowrap p-3">{new Date(file.createdAt).toLocaleString("zh-TW")}</td>
                    <td className="p-3 font-mono text-xs">{file.name}</td>
                    <td className="whitespace-nowrap p-3 text-right">{formatBytes(file.size)}</td>
                    <td className="max-w-[260px] truncate p-3 font-mono text-xs" title={file.sha256 || "尚無雜湊"}>{file.sha256 || "—"}</td>
                    <td className="p-3 text-right"><Button size="sm" variant="outline" asChild><a href={`/api/system/backup?file=${encodeURIComponent(file.name)}`} download><Download className="h-4 w-4" />下載</a></Button></td>
                  </tr>
                ))}
                {!loading && files.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">尚無加密備份</td></tr>}
                {loading && <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">載入中…</td></tr>}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-200 border border-amber-200 dark:border-amber-900 p-3 rounded-md">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <div className="font-semibold mb-1">注意事項</div>
            <ul className="list-disc list-inside space-y-0.5">
              <li>備份檔包含全部營運資料，已使用 AES-256-GCM 加密；請另存一份至 NAS 或雲端。</li>
              <li>復原金鑰必須與備份檔分開保存；遺失金鑰後，艾琳設計也無法解密。</li>
              <li>為避免營業中覆蓋或部分還原，瀏覽器不提供直接上傳還原。</li>
              <li>正式還原須先停止系統，由維護人員建立安全備份、驗證檔案後執行完整資料庫復原。</li>
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
    </>
  );
}
