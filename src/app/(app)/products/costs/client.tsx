"use client";
import { useEffect, useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { EmptyState } from "@/components/layout/page-shell";
import { toast } from "sonner";
import { Search, Loader2, Save, FileSpreadsheet, Upload, RotateCcw, Printer, FileDown, Trash2, Plus } from "lucide-react";
import { formatMoney } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useCustomColumns, CustomColumnDialog, CustomColumnButton, getCustomFieldValues, setCustomFieldValue } from "@/components/custom-columns";

type Product = {
  id: string;
  sku: string;
  name: string;
  spec?: string | null;
  costPrice: any;
  salePrice: any;
};

export function CostManagementClient() {
  const [rows, setRows] = useState<Product[]>([]);
  const [drafts, setDrafts] = useState<Record<string, { costPrice?: number; salePrice?: number }>>({});
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingAll, setSavingAll] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newForm, setNewForm] = useState({ sku: "", name: "", spec: "", costPrice: "", salePrice: "" });
  const [addSaving, setAddSaving] = useState(false);
  const customCols = useCustomColumns("costs");
  const [editingCells, setEditingCells] = useState<Record<string, any>>({});
  const pageSize = 30;

  // debounce 搜尋
  useEffect(() => {
    const t = setTimeout(() => { setPage(1); setQ(searchInput); }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  async function load() {
    setLoading(true);
    const params = new URLSearchParams({ q, page: String(page), pageSize: String(pageSize) });
    if (fromDate) params.set("from", fromDate);
    if (toDate) params.set("to", toDate);
    const res = await fetch(`/api/products?${params.toString()}`);
    const d = await res.json();
    setRows(d.items);
    setTotal(d.total);
    setDrafts({});
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [page, q, fromDate, toDate]);

  const dirtyCount = useMemo(() => Object.keys(drafts).length, [drafts]);

  function update(id: string, field: "costPrice" | "salePrice", value: number) {
    setDrafts((d) => ({ ...d, [id]: { ...d[id], [field]: value } }));
  }

  async function saveOne(id: string) {
    const patch = drafts[id]; if (!patch) return;
    const row = rows.find((r) => r.id === id); if (!row) return;
    try {
      const body: any = { ...row, ...patch };
      const res = await fetch(`/api/products/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error((await res.json()).error || "儲存失敗");
      toast.success(`${row.sku} 已更新`);
      setDrafts(({ [id]: _, ...rest }) => rest);
      load();
    } catch (e: any) { toast.error(e.message); }
  }

  async function saveAll() {
    setSavingAll(true);
    let ok = 0, fail = 0;
    for (const id of Object.keys(drafts)) {
      const row = rows.find((r) => r.id === id); if (!row) continue;
      try {
        const body: any = { ...row, ...drafts[id] };
        const res = await fetch(`/api/products/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        if (!res.ok) fail++; else ok++;
      } catch { fail++; }
    }
    setSavingAll(false);
    if (fail === 0) toast.success(`已更新 ${ok} 筆`);
    else toast.error(`成功 ${ok} / 失敗 ${fail}`);
    load();
  }

  async function importCosts(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    try {
      const { readExcelFile } = await import("@/lib/excel");
      const list = await readExcelFile(file);
      // 用 SKU 對應 product
      const all = await fetch(`/api/products?pageSize=10000`).then((r) => r.json());
      const bySku = new Map<string, any>((all.items as any[]).map((p) => [p.sku, p]));
      let ok = 0; const errors: string[] = [];
      for (let i = 0; i < list.length; i++) {
        const r = list[i] as any;
        const sku = String(r["SKU"] ?? r.sku ?? "").trim();
        const product = bySku.get(sku);
        if (!product) { errors.push(`第 ${i + 2} 列：找不到 SKU ${sku}`); continue; }
        const body = {
          ...product,
          costPrice: r["成本"] != null ? Number(r["成本"]) : Number(product.costPrice),
          salePrice: r["售價"] != null ? Number(r["售價"]) : Number(product.salePrice),
        };
        try {
          const res = await fetch(`/api/products/${product.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
          if (!res.ok) errors.push(`第 ${i + 2} 列：${(await res.json()).error || "失敗"}`);
          else ok++;
        } catch (err: any) { errors.push(`第 ${i + 2} 列：${err.message}`); }
      }
      if (errors.length === 0) toast.success(`已更新 ${ok} 筆`);
      else toast.error(`成功 ${ok} / 失敗 ${errors.length}\n${errors.slice(0, 3).join("\n")}`);
      load();
    } catch (err: any) { toast.error(err.message); }
    finally { e.target.value = ""; }
  }

  async function exportExcel() {
    const all = await fetch(`/api/products?q=${encodeURIComponent(q)}&pageSize=10000`).then((r) => r.json());
    const { downloadExcel } = await import("@/lib/excel");
    downloadExcel("product-costs", "商品成本", all.items, [
      { key: "sku", title: "SKU" },
      { key: "name", title: "商品名稱" },
      { key: "spec", title: "規格" },
      { key: "costPrice", title: "成本", get: (r: any) => Number(r.costPrice) },
      { key: "salePrice", title: "售價", get: (r: any) => Number(r.salePrice) },
    ]);
    toast.success("已匯出 Excel");
  }

  const [pdfBusy, setPdfBusy] = useState(false);

  async function exportPDF() {
    setPdfBusy(true);
    try {
      const { exportPageToPDF } = await import("@/lib/export-pdf");
      await exportPageToPDF("成本管理", "product-costs");
    } finally { setPdfBusy(false); }
  }

  async function deleteProduct(id: string, sku: string) {
    if (!confirm(`確定刪除商品 ${sku}？`)) return;
    try {
      const res = await fetch(`/api/products/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error || "刪除失敗");
      toast.success(`已刪除 ${sku}`);
      load();
    } catch (e: any) { toast.error(e.message); }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input placeholder="搜尋 SKU / 商品名稱" className="pl-9 w-72" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
          </div>
          <Input type="date" value={fromDate} onChange={(e) => { setPage(1); setFromDate(e.target.value); }} className="w-36" />
          <Input type="date" value={toDate} onChange={(e) => { setPage(1); setToDate(e.target.value); }} className="w-36" />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" onClick={exportPDF} disabled={pdfBusy}>
            {pdfBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}PDF
          </Button>
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="h-4 w-4" />列印
          </Button>
          <Button variant="outline" onClick={exportExcel}><FileSpreadsheet className="h-4 w-4" />匯出 Excel</Button>
          <input id="import-costs" type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={importCosts} />
          <Button variant="outline" onClick={() => document.getElementById("import-costs")?.click()}>
            <Upload className="h-4 w-4" />匯入 Excel
          </Button>
          {dirtyCount > 0 && (
            <>
              <Button variant="ghost" onClick={() => setDrafts({})}><RotateCcw className="h-4 w-4" />還原</Button>
              <Button onClick={saveAll} disabled={savingAll}>
                {savingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                儲存全部 ({dirtyCount})
              </Button>
            </>
          )}
          <CustomColumnButton onClick={() => customCols.setOpen(true)} />
          <Button onClick={() => setShowAdd(true)}><Plus className="h-4 w-4" />新增</Button>
        </div>
      </div>

      {showAdd && (
        <Dialog open onOpenChange={(v) => !v && setShowAdd(false)}>
          <DialogContent>
            <DialogHeader><DialogTitle>新增商品</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>SKU *</Label>
                <Input value={newForm.sku} onChange={(e) => setNewForm({ ...newForm, sku: e.target.value })} placeholder="例: P006" />
              </div>
              <div className="space-y-1">
                <Label>商品名稱 *</Label>
                <Input value={newForm.name} onChange={(e) => setNewForm({ ...newForm, name: e.target.value })} placeholder="例: 範例商品 F" />
              </div>
              <div className="space-y-1">
                <Label>規格</Label>
                <Input value={newForm.spec} onChange={(e) => setNewForm({ ...newForm, spec: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>成本</Label>
                  <Input type="number" step="0.01" value={newForm.costPrice || ""} onChange={(e) => setNewForm({ ...newForm, costPrice: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>售價</Label>
                  <Input type="number" step="0.01" value={newForm.salePrice || ""} onChange={(e) => setNewForm({ ...newForm, salePrice: e.target.value })} />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAdd(false)}>取消</Button>
              <Button disabled={addSaving || !newForm.sku || !newForm.name} onClick={async () => {
                setAddSaving(true);
                try {
                  const res = await fetch("/api/products", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newForm) });
                  if (!res.ok) throw new Error((await res.json()).error || "新增失敗");
                  toast.success("已新增商品");
                  setShowAdd(false);
                  setNewForm({ sku: "", name: "", spec: "", costPrice: "", salePrice: "" });
                  load();
                } catch (e: any) { toast.error(e.message); }
                finally { setAddSaving(false); }
              }}>
                {addSaving ? "儲存中..." : "儲存"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <Table>
        <THead>
          <TR>
            <TH>SKU</TH><TH>商品名稱</TH><TH>規格</TH>
            <TH className="w-40">成本</TH><TH className="w-40">售價</TH>
            <TH className="w-20 text-right">毛利率</TH>
            {customCols.columns.map((cc) => <TH key={cc.id}>{cc.label}</TH>)}
            <TH className="w-24 text-right">操作</TH>
          </TR>
        </THead>
        <TBody>
          {loading && <TR><TD colSpan={7} className="text-center py-10"><Loader2 className="inline h-5 w-5 animate-spin" /></TD></TR>}
          {!loading && rows.length === 0 && <TR><TD colSpan={7}><EmptyState /></TD></TR>}
          {!loading && rows.map((r) => {
            const draft = drafts[r.id];
            const cost = draft?.costPrice ?? Number(r.costPrice);
            const sale = draft?.salePrice ?? Number(r.salePrice);
            const margin = sale > 0 ? ((sale - cost) / sale * 100).toFixed(1) : "—";
            const dirty = !!draft;
            return (
              <TR key={r.id} className={dirty ? "bg-amber-50/40 dark:bg-amber-950/20" : ""}>
                <TD className="font-mono text-xs">{r.sku}</TD>
                <TD>{r.name}</TD>
                <TD className="text-muted-foreground text-xs">{r.spec ?? "—"}</TD>
                <TD>
                  <Input
                    inputMode="decimal"
                    value={cost}
                    onChange={(e) => update(r.id, "costPrice", Number(e.target.value.replace(/[^0-9.]/g, "")))}
                    className="h-8 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  />
                </TD>
                <TD>
                  <Input
                    inputMode="decimal"
                    value={sale}
                    onChange={(e) => update(r.id, "salePrice", Number(e.target.value.replace(/[^0-9.]/g, "")))}
                    className="h-8 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  />
                </TD>
                <TD className="text-right text-xs">{margin === "—" ? "—" : `${margin}%`}</TD>
                {customCols.columns.map((cc) => { const ck = `${r.id}_${cc.id}`; const v = getCustomFieldValues("costs", r.id); const isE = editingCells[ck]; return <TD key={cc.id}>{isE ? <Input type={cc.type === "number" ? "number" : cc.type === "date" ? "date" : "text"} defaultValue={v[cc.id] ?? ""} autoFocus className="h-7 text-xs" onBlur={(e) => { setCustomFieldValue("costs", r.id, cc.id, e.target.value); setEditingCells((p) => ({ ...p, [ck]: false })); }} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} /> : <span className="inline-block min-h-[24px] min-w-[40px] cursor-pointer rounded px-1 py-0.5 transition-colors hover:bg-muted" onClick={() => setEditingCells((p) => ({ ...p, [ck]: true }))}>{v[cc.id] || "—"}</span>}</TD>; })}
                <TD className="text-right flex items-center justify-end gap-1">
                  {dirty && (
                    <Button size="sm" variant="outline" onClick={() => saveOne(r.id)}>
                      <Save className="h-4 w-4" />
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700" onClick={() => deleteProduct(r.id, r.sku)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TD>
              </TR>
            );
          })}
        </TBody>
      </Table>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <div>共 {total} 筆 {dirtyCount > 0 && <span className="text-amber-600 ml-2">({dirtyCount} 筆未儲存)</span>}</div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>上一頁</Button>
          <span>{page} / {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>下一頁</Button>
        </div>
      </div>
      <CustomColumnDialog module="costs" columns={customCols.columns} open={customCols.open} onClose={() => customCols.setOpen(false)} onSave={customCols.save} />
    </div>
  );
}
