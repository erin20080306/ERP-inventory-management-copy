"use client";
import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Download, Upload, Database, AlertTriangle, Loader2, Mail } from "lucide-react";

export function SettingsClient() {
  const [form, setForm] = useState<any>({ name: "", currency: "TWD", smtpSecure: true, smtpPort: 465 });
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    fetch("/api/settings").then((r) => r.json()).then((d) => setForm({
      name: "",
      currency: "TWD",
      smtpSecure: true,
      smtpPort: 465,
      ...(d.company ?? {}),
      smtpPassword: "",
    }));
  }, []);
  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (!res.ok) throw new Error((await res.json()).error || "儲存失敗");
      toast.success("已儲存");
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  }
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>公司基本資料</CardTitle></CardHeader>
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
      <BackupCard />
    </div>
  );
}

function BackupCard() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [backing, setBacking] = useState(false);
  const [restoring, setRestoring] = useState(false);

  async function doBackup() {
    setBacking(true);
    try {
      const res = await fetch("/api/system/backup");
      if (!res.ok) throw new Error((await res.json()).error || "備份失敗");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `erp-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("備份檔已下載");
    } catch (e: any) { toast.error(e.message); } finally { setBacking(false); }
  }

  async function onPickRestore(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!confirm("⚠️ 還原會覆蓋目前所有資料且無法復原！是否確定？")) {
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    setRestoring(true);
    try {
      const text = await f.text();
      const json = JSON.parse(text);
      const res = await fetch("/api/system/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(json),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "還原失敗");
      const tableCount = Object.keys(d.counts).length;
      toast.success(`還原完成，已匯入 ${tableCount} 個資料表，請重新登入`);
      setTimeout(() => { window.location.href = "/login"; }, 1500);
    } catch (e: any) { toast.error(e.message); } finally {
      setRestoring(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const busy = backing || restoring;

  return (
    <>
      {busy && (
        <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm">
          <Loader2 className="h-12 w-12 animate-spin text-white mb-4" />
          <div className="text-white text-xl font-semibold">{backing ? "備份作業中，請稍候..." : "還原作業中，請勿關閉頁面..."}</div>
          <div className="text-white/70 text-sm mt-2">{backing ? "正在匯出資料庫" : "正在清空並重建資料庫，可能需要數十秒"}</div>
        </div>
      )}
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Database className="h-5 w-5" />系統備份與還原</CardTitle>
        <CardDescription>將目前資料庫所有資料匯出為單一 JSON 備份檔，或從備份檔還原資料庫。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={doBackup} disabled={busy}>
            <Download className="h-4 w-4" />{backing ? "備份中..." : "立即備份下載"}
          </Button>
          <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={busy}>
            <Upload className="h-4 w-4" />{restoring ? "還原中..." : "從備份檔還原"}
          </Button>
          <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={onPickRestore} />
        </div>
        <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-200 border border-amber-200 dark:border-amber-900 p-3 rounded-md">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <div className="font-semibold mb-1">注意事項</div>
            <ul className="list-disc list-inside space-y-0.5">
              <li>備份檔含**全部資料**（含使用者密碼雜湊），請妥善保管，不得外流。</li>
              <li>還原會**清空目前所有資料**並以備份檔取代，作業期間請勿其他人員操作。</li>
              <li>建議在還原前先做一次新備份，並於非營運時段進行。</li>
              <li>還原完成後系統會自動登出，請使用備份當時的帳號重新登入。</li>
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
    </>
  );
}
