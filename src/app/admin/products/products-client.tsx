"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, ChevronLeft, ChevronRight, Loader2, Package, Pencil, Plus,
  RefreshCw, Search, Store, Trash2,
} from "lucide-react";
import { toast } from "sonner";

const CATALOGS = [
  ["ERP", "企業 ERP"],
  ["POS_RETAIL", "零售 POS"],
  ["POS_RESTAURANT", "餐飲 POS"],
  ["ECOMMERCE", "電商商城"],
  ["POS_MEDICAL", "醫美 POS"],
] as const;

type TenantOption = {
  id: string;
  name: string;
  companyCode: string | null;
  businessMode: string;
  isInternal: boolean;
  productCount: number;
};

type ProductRow = {
  id: string;
  tenantId: string;
  catalogMode: string | null;
  sku: string;
  barcode: string | null;
  name: string;
  spec: string | null;
  description: string | null;
  imageUrl: string | null;
  costPrice: number;
  salePrice: number;
  safetyStock: number;
  stockTotal: number;
  isActive: boolean;
  isPublished: boolean;
  remark: string | null;
  updatedAt: string;
  tenant: {
    name: string;
    companyCode: string | null;
    businessMode: string;
    isInternal: boolean;
  };
};

type ProductForm = {
  tenantId: string;
  catalogMode: string;
  sku: string;
  barcode: string;
  name: string;
  spec: string;
  description: string;
  imageUrl: string;
  costPrice: string;
  salePrice: string;
  safetyStock: string;
  stockQty: string;
  isActive: boolean;
  isPublished: boolean;
  remark: string;
};

const emptyForm: ProductForm = {
  tenantId: "",
  catalogMode: "ECOMMERCE",
  sku: "",
  barcode: "",
  name: "",
  spec: "",
  description: "",
  imageUrl: "",
  costPrice: "0",
  salePrice: "0",
  safetyStock: "0",
  stockQty: "0",
  isActive: true,
  isPublished: true,
  remark: "",
};

function catalogLabel(value: string | null) {
  return CATALOGS.find(([key]) => key === value)?.[1] || value || "未分類";
}

function money(value: number) {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function AdminProductsClient() {
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [catalog, setCatalog] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [editing, setEditing] = useState<ProductRow | "new" | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: "30" });
      if (search) params.set("q", search);
      if (tenantId) params.set("tenantId", tenantId);
      if (catalog) params.set("catalog", catalog);
      const response = await fetch(`/api/admin/products?${params}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "商品資料載入失敗");
      setRows(result.items || []);
      setTenants(result.tenants || []);
      setTotal(result.pagination?.total || 0);
      setTotalPages(result.pagination?.totalPages || 1);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "商品資料載入失敗");
    } finally {
      setLoading(false);
    }
  }, [catalog, page, search, tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedTenant = useMemo(
    () => tenants.find((tenant) => tenant.id === tenantId),
    [tenantId, tenants],
  );

  function openNew() {
    const firstTenant = selectedTenant || tenants.find((tenant) => tenant.isInternal) || tenants[0];
    setForm({
      ...emptyForm,
      tenantId: firstTenant?.id || "",
      catalogMode: catalog || firstTenant?.businessMode || "ECOMMERCE",
    });
    setEditing("new");
  }

  function openEdit(row: ProductRow) {
    setForm({
      tenantId: row.tenantId,
      catalogMode: row.catalogMode || row.tenant.businessMode,
      sku: row.sku,
      barcode: row.barcode || "",
      name: row.name,
      spec: row.spec || "",
      description: row.description || "",
      imageUrl: row.imageUrl || "",
      costPrice: String(row.costPrice),
      salePrice: String(row.salePrice),
      safetyStock: String(row.safetyStock),
      stockQty: String(row.stockTotal),
      isActive: row.isActive,
      isPublished: row.isPublished,
      remark: row.remark || "",
    });
    setEditing(row);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!form.tenantId || !form.sku.trim() || !form.name.trim()) {
      return toast.error("請選擇租戶並填寫 SKU 與商品名稱");
    }
    setSaving(true);
    try {
      const isNew = editing === "new";
      const response = await fetch(isNew ? "/api/admin/products" : `/api/admin/products/${(editing as ProductRow).id}`, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(isNew ? { tenantId: form.tenantId, stockQty: Number(form.stockQty || 0) } : {}),
          catalogMode: form.catalogMode,
          sku: form.sku.trim(),
          barcode: form.barcode.trim() || null,
          name: form.name.trim(),
          spec: form.spec.trim() || null,
          description: form.description.trim() || null,
          imageUrl: form.imageUrl.trim() || null,
          costPrice: Number(form.costPrice || 0),
          salePrice: Number(form.salePrice || 0),
          safetyStock: Number(form.safetyStock || 0),
          isActive: form.isActive,
          isPublished: form.isPublished,
          remark: form.remark.trim() || null,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "商品儲存失敗");
      toast.success(isNew ? "商品已建立" : "商品已更新");
      setEditing(null);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "商品儲存失敗");
    } finally {
      setSaving(false);
    }
  }

  async function archive(row: ProductRow) {
    if (!window.confirm(`確定封存「${row.name}」？歷史訂單仍會保留。`)) return;
    const response = await fetch(`/api/admin/products/${row.id}`, { method: "DELETE" });
    const result = await response.json();
    if (!response.ok) return toast.error(result.error || "商品封存失敗");
    toast.success("商品已封存");
    await load();
  }

  return (
    <main className="min-h-screen bg-slate-950 p-4 text-slate-100 md:p-7">
      <div className="mx-auto max-w-[1500px] space-y-5">
        <header className="flex flex-col justify-between gap-4 xl:flex-row xl:items-center">
          <div>
            <Link href="/admin" className="mb-3 inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white"><ArrowLeft className="h-4 w-4" />返回平台管理</Link>
            <h1 className="flex items-center gap-3 text-2xl font-black"><Package className="h-7 w-7 text-sky-300" />全部租戶商品資料</h1>
            <p className="mt-2 text-sm text-slate-400">跨租戶查閱與維護商品；每筆異動仍保留租戶隔離與管理稽核。</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => void load()} className="admin-product-button border border-slate-700 bg-slate-900"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />重新整理</button>
            <button onClick={openNew} disabled={!tenants.length} className="admin-product-button bg-sky-600 text-white hover:bg-sky-500"><Plus className="h-4 w-4" />新增商品</button>
          </div>
        </header>

        <section className="grid gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-4 md:grid-cols-[minmax(220px,1fr)_220px_220px_auto]">
          <label className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => {
              if (event.key === "Enter") {
                setSearch(query.trim());
                setPage(1);
              }
            }} placeholder="搜尋租戶、SKU、名稱或條碼" className="h-10 w-full rounded-xl border border-slate-700 bg-slate-950 pl-9 pr-3 text-sm outline-none focus:border-sky-400" />
          </label>
          <select value={tenantId} onChange={(event) => { setTenantId(event.target.value); setPage(1); }} className="h-10 rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm">
            <option value="">全部租戶</option>
            {tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.isInternal ? "【內部】" : ""}{tenant.name}（{tenant.productCount}）</option>)}
          </select>
          <select value={catalog} onChange={(event) => { setCatalog(event.target.value); setPage(1); }} className="h-10 rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm">
            <option value="">全部商品目錄</option>
            {CATALOGS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <button onClick={() => { setSearch(query.trim()); setPage(1); }} className="admin-product-button bg-slate-700 hover:bg-slate-600">搜尋</button>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1200px] text-left text-sm">
              <thead className="bg-slate-950/70 text-xs text-slate-500">
                <tr><th className="p-4">租戶</th><th className="p-4">目錄</th><th className="p-4">商品</th><th className="p-4">成本／售價</th><th className="p-4">實體庫存</th><th className="p-4">商城</th><th className="p-4">狀態</th><th className="p-4 text-right">管理</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {loading && rows.length === 0 ? <tr><td colSpan={8} className="p-16 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-sky-300" /></td></tr> : null}
                {!loading && rows.length === 0 ? <tr><td colSpan={8} className="p-16 text-center text-slate-500">沒有符合條件的商品</td></tr> : null}
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-white/[.025]">
                    <td className="p-4"><div className="font-semibold">{row.tenant.name}</div><div className="mt-1 font-mono text-[11px] text-slate-500">{row.tenant.companyCode || row.tenantId}</div></td>
                    <td className="p-4"><span className="rounded-full border border-slate-700 bg-slate-950 px-3 py-1 text-xs">{catalogLabel(row.catalogMode)}</span></td>
                    <td className="p-4"><div className="flex items-center gap-3">{row.imageUrl ? <img src={row.imageUrl} alt="" className="h-11 w-11 rounded-lg border border-slate-700 object-cover" /> : <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-700 bg-slate-950"><Package className="h-4 w-4 text-slate-600" /></div>}<div><div className="font-semibold text-white">{row.name}</div><div className="mt-1 font-mono text-xs text-sky-300">{row.sku}{row.spec ? `・${row.spec}` : ""}</div></div></div></td>
                    <td className="p-4"><div>{money(row.costPrice)}</div><div className="mt-1 font-bold text-emerald-300">{money(row.salePrice)}</div></td>
                    <td className="p-4 font-semibold">{row.stockTotal.toLocaleString("zh-TW")}</td>
                    <td className="p-4">{row.catalogMode === "ECOMMERCE" ? <span className={row.isPublished ? "text-emerald-300" : "text-slate-500"}><Store className="mr-1 inline h-4 w-4" />{row.isPublished ? "已上架" : "已下架"}</span> : "—"}</td>
                    <td className="p-4"><span className={row.isActive ? "text-emerald-300" : "text-rose-300"}>{row.isActive ? "啟用" : "停用"}</span></td>
                    <td className="p-4 text-right"><button onClick={() => openEdit(row)} className="rounded-lg p-2 text-sky-300 hover:bg-sky-400/10" title="編輯"><Pencil className="h-4 w-4" /></button><button onClick={() => void archive(row)} className="rounded-lg p-2 text-rose-300 hover:bg-rose-400/10" title="封存"><Trash2 className="h-4 w-4" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-slate-800 p-4 text-sm text-slate-400">
            <span>共 {total} 項，第 {page}/{totalPages} 頁</span>
            <div className="flex gap-2"><button disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)} className="rounded-lg border border-slate-700 p-2 disabled:opacity-30"><ChevronLeft className="h-4 w-4" /></button><button disabled={page >= totalPages || loading} onClick={() => setPage((value) => value + 1)} className="rounded-lg border border-slate-700 p-2 disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button></div>
          </div>
        </section>
      </div>

      {editing && (
        <div className="fixed inset-0 z-[1300] flex items-center justify-center bg-black/70 p-4" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !saving) setEditing(null);
        }}>
          <form onSubmit={save} className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between"><h2 className="text-xl font-black">{editing === "new" ? "新增租戶商品" : "編輯租戶商品"}</h2><button type="button" onClick={() => setEditing(null)} className="text-slate-400 hover:text-white">關閉</button></div>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="space-y-1 text-sm"><span className="text-slate-400">租戶 *</span><select disabled={editing !== "new"} value={form.tenantId} onChange={(event) => {
                const tenant = tenants.find((item) => item.id === event.target.value);
                setForm((current) => ({ ...current, tenantId: event.target.value, catalogMode: tenant?.businessMode || current.catalogMode }));
              }} className="admin-product-input">{tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.isInternal ? "【內部】" : ""}{tenant.name}</option>)}</select></label>
              <label className="space-y-1 text-sm"><span className="text-slate-400">商品目錄 *</span><select value={form.catalogMode} onChange={(event) => setForm((current) => ({ ...current, catalogMode: event.target.value }))} className="admin-product-input">{CATALOGS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label className="space-y-1 text-sm"><span className="text-slate-400">SKU *</span><input value={form.sku} onChange={(event) => setForm((current) => ({ ...current, sku: event.target.value }))} className="admin-product-input" /></label>
              <label className="space-y-1 text-sm"><span className="text-slate-400">條碼</span><input value={form.barcode} onChange={(event) => setForm((current) => ({ ...current, barcode: event.target.value }))} className="admin-product-input" /></label>
              <label className="space-y-1 text-sm md:col-span-2"><span className="text-slate-400">商品名稱 *</span><input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} className="admin-product-input" /></label>
              <label className="space-y-1 text-sm"><span className="text-slate-400">規格</span><input value={form.spec} onChange={(event) => setForm((current) => ({ ...current, spec: event.target.value }))} className="admin-product-input" /></label>
              <label className="space-y-1 text-sm"><span className="text-slate-400">圖片網址</span><input value={form.imageUrl} onChange={(event) => setForm((current) => ({ ...current, imageUrl: event.target.value }))} className="admin-product-input" /></label>
              <label className="space-y-1 text-sm"><span className="text-slate-400">成本</span><input type="number" min="0" step="0.0001" value={form.costPrice} onChange={(event) => setForm((current) => ({ ...current, costPrice: event.target.value }))} className="admin-product-input" /></label>
              <label className="space-y-1 text-sm"><span className="text-slate-400">售價</span><input type="number" min="0" step="0.0001" value={form.salePrice} onChange={(event) => setForm((current) => ({ ...current, salePrice: event.target.value }))} className="admin-product-input" /></label>
              <label className="space-y-1 text-sm"><span className="text-slate-400">安全庫存</span><input type="number" min="0" value={form.safetyStock} onChange={(event) => setForm((current) => ({ ...current, safetyStock: event.target.value }))} className="admin-product-input" /></label>
              {editing === "new" && <label className="space-y-1 text-sm"><span className="text-slate-400">主倉期初庫存</span><input type="number" min="0" value={form.stockQty} onChange={(event) => setForm((current) => ({ ...current, stockQty: event.target.value }))} className="admin-product-input" /></label>}
              <label className="space-y-1 text-sm md:col-span-2"><span className="text-slate-400">商品說明</span><textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} className="admin-product-input min-h-24" /></label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isActive} onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))} />ERP／POS 啟用</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isPublished} onChange={(event) => setForm((current) => ({ ...current, isPublished: event.target.checked }))} />商城對外上架</label>
            </div>
            <div className="mt-6 flex justify-end gap-2"><button type="button" disabled={saving} onClick={() => setEditing(null)} className="admin-product-button border border-slate-700">取消</button><button disabled={saving} className="admin-product-button bg-sky-600 hover:bg-sky-500">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{saving ? "儲存中" : "儲存商品"}</button></div>
          </form>
        </div>
      )}

      <style jsx global>{`
        .admin-product-button{display:inline-flex;height:2.5rem;align-items:center;justify-content:center;gap:.45rem;border-radius:.75rem;padding:0 .9rem;font-size:.8rem;font-weight:700;transition:.15s}
        .admin-product-input{display:block;width:100%;border:1px solid rgb(51 65 85);border-radius:.75rem;background:rgb(2 6 23);padding:.65rem .75rem;color:white;outline:none}
        .admin-product-input:focus{border-color:rgb(56 189 248)}
        .admin-product-input:disabled{opacity:.55}
      `}</style>
    </main>
  );
}
