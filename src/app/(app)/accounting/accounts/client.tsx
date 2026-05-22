"use client";
import { useEffect, useRef, useState } from "react";
import { CrudTable } from "@/components/crud-table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { formatMoney } from "@/lib/utils";
import { Upload, FileDown } from "lucide-react";
import { downloadCSV } from "@/lib/csv";

const typeLabel: Record<string, string> = { ASSET: "資產", LIABILITY: "負債", EQUITY: "權益", REVENUE: "收入", COST: "成本", EXPENSE: "費用" };
const typeVariant: Record<string, any> = { ASSET: "info", LIABILITY: "warning", EQUITY: "default", REVENUE: "success", COST: "default", EXPENSE: "danger" };

function AccountDialog({ open, onClose, row, onSaved }: any) {
  const [form, setForm] = useState<any>({ code: "", name: "", type: "ASSET", openingBalance: 0, isActive: true });
  useEffect(() => {
    setForm(row ?? { code: "", name: "", type: "ASSET", openingBalance: 0, isActive: true });
  }, [row, open]);
  async function save() {
    try {
      const res = await fetch(row ? `/api/accounting/accounts/${row.id}` : "/api/accounting/accounts", {
        method: row ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, openingBalance: Number(form.openingBalance) }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "儲存失敗");
      toast.success("已儲存");
      onSaved();
      onClose();
    } catch (e: any) {
      toast.error(e.message);
    }
  }
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{row ? "編輯科目" : "新增科目"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label>科目編號 *</Label><Input value={form.code ?? ""} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
          <div className="space-y-1"><Label>科目名稱 *</Label><Input value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="space-y-1">
            <Label>科目類型</Label>
            <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              {Object.entries(typeLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div className="space-y-1"><Label>期初餘額</Label><Input type="number" step="0.01" value={form.openingBalance ?? 0} onChange={(e) => setForm({ ...form, openingBalance: e.target.value })} /></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />啟用</label>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>取消</Button><Button onClick={save}>儲存</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ImportBar({ onImported }: { onImported: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  function downloadTemplate() {
    const csv =
      "\uFEFF代碼,名稱,類型\n" +
      "1101,庫存現金,資產\n" +
      "2101,短期借款,負債\n" +
      "3101,資本,權益\n" +
      "4101,銷貨收入,收入\n" +
      "5101,銷貨成本,成本\n" +
      "6101,薪資費用,費用\n";
    downloadCSV("會計科目匯入範本.csv", csv);
  }

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setBusy(true);
    try {
      const text = await f.text();
      const res = await fetch("/api/accounting/accounts/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv: text }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "匯入失敗");
      toast.success(`匯入完成：新增 ${d.created}、更新 ${d.updated}` + (d.errors?.length ? `，${d.errors.length} 筆略過` : ""));
      if (d.errors?.length) console.warn(d.errors);
      onImported();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="flex items-center gap-2 mb-3">
      <Button variant="outline" size="sm" onClick={downloadTemplate}>
        <FileDown className="h-4 w-4" />下載範本
      </Button>
      <Button size="sm" onClick={() => fileRef.current?.click()} disabled={busy}>
        <Upload className="h-4 w-4" />{busy ? "匯入中..." : "匯入 CSV"}
      </Button>
      <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={onPick} />
      <span className="text-xs text-muted-foreground">支援欄位：代碼、名稱、類型（資產/負債/權益/收入/成本/費用）</span>
    </div>
  );
}

export function AccountClient() {
  const [refreshKey, setRefreshKey] = useState(0);
  return (
    <div>
      <ImportBar onImported={() => setRefreshKey((k) => k + 1)} />
      <CrudTable
        key={refreshKey}
        endpoint="/api/accounting/accounts"
        moduleKey="accounts"
        exportName="accounts"
        pdfTitle="會計科目"
        enableDateFilter={true}
        FormDialog={AccountDialog}
        templateHeaders={["編號", "名稱", "類型", "期初餘額"]}
        importMap={(r) => {
          const typeRaw = String(r["類型"] ?? r.type ?? "").trim();
          const typeMap: Record<string, string> = { 資產: "ASSET", 負債: "LIABILITY", 權益: "EQUITY", 收入: "REVENUE", 費用: "EXPENSE", 成本: "COST" };
          return {
            code: String(r["編號"] ?? r.code ?? "").trim(),
            name: String(r["名稱"] ?? r.name ?? "").trim(),
            type: typeMap[typeRaw] || typeRaw.toUpperCase(),
            openingBalance: Number(r["期初餘額"] ?? r.openingBalance ?? 0),
          };
        }}
        columns={[
          { key: "code", title: "編號", render: (r: any) => <span className="font-mono text-xs">{r.code}</span> },
          { key: "name", title: "名稱" },
          { key: "type", title: "類型", csv: (r: any) => typeLabel[r.type] ?? r.type, render: (r: any) => <Badge variant={typeVariant[r.type]}>{typeLabel[r.type] ?? r.type}</Badge> },
          { key: "openingBalance", title: "期初餘額", render: (r: any) => formatMoney(r.openingBalance) },
          { key: "isActive", title: "狀態", csv: (r: any) => (r.isActive ? "啟用" : "停用"), render: (r: any) => (r.isActive ? <Badge variant="success">啟用</Badge> : <Badge variant="danger">停用</Badge>) },
        ]}
      />
    </div>
  );
}
