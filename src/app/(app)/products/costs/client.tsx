"use client";
import { useEffect, useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { EmptyState } from "@/components/layout/page-shell";
import { toast } from "sonner";
import { Search, Loader2, Save, FileSpreadsheet, Upload, RotateCcw } from "lucide-react";
import { formatMoney } from "@/lib/utils";

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
  const [loading, setLoading] = useState(true);
  const [savingAll, setSavingAll] = useState(false);
  const pageSize = 30;

  // debounce 搜尋
  useEffect(() => {
    const t = setTimeout(() => { setPage(1); setQ(searchInput); }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/products?q=${encodeURIComponent(q)}&page=${page}&pageSize=${pageSize}`);
    const d = await res.json();
    setRows(d.items);
    setTotal(d.total);
    setDrafts({});
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [page, q]);

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

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input placeholder="搜尋 SKU / 商品名稱" className="pl-9 w-72" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
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
        </div>
      </div>

      <Table>
        <THead>
          <TR>
            <TH>SKU</TH><TH>商品名稱</TH><TH>規格</TH>
            <TH className="w-40">成本</TH><TH className="w-40">售價</TH>
            <TH className="w-20 text-right">毛利率</TH>
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
                    type="number"
                    step="0.01"
                    value={cost}
                    onChange={(e) => update(r.id, "costPrice", Number(e.target.value))}
                    className="h-8"
                  />
                </TD>
                <TD>
                  <Input
                    type="number"
                    step="0.01"
                    value={sale}
                    onChange={(e) => update(r.id, "salePrice", Number(e.target.value))}
                    className="h-8"
                  />
                </TD>
                <TD className="text-right text-xs">{margin === "—" ? "—" : `${margin}%`}</TD>
                <TD className="text-right">
                  {dirty && (
                    <Button size="sm" variant="outline" onClick={() => saveOne(r.id)}>
                      <Save className="h-4 w-4" />
                    </Button>
                  )}
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
    </div>
  );
}
