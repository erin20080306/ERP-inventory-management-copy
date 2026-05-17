"use client";
import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Download, Upload, Database, AlertTriangle, Loader2 } from "lucide-react";

export function SettingsClient() {
  const [form, setForm] = useState<any>({ name: "", currency: "TWD" });
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    fetch("/api/settings").then((r) => r.json()).then((d) => setForm(d.company ?? { name: "", currency: "TWD" }));
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
