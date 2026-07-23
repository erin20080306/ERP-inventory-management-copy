"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  ArchiveRestore,
  ChefHat,
  Clock3,
  CreditCard,
  Loader2,
  Minus,
  Pencil,
  Plus,
  Printer,
  ReceiptText,
  RefreshCw,
  Search,
  Send,
  Settings2,
  Store,
  Trash2,
  Users,
  UtensilsCrossed,
} from "lucide-react";
import { toast } from "sonner";
import { resolveDemoProductImage } from "@/lib/demo-product-media";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Product = {
  id: string;
  sku: string;
  name: string;
  imageUrl: string | null;
  salePrice: number;
  stockTotal: number;
  categoryId: string | null;
  category: { name: string } | null;
};
type OrderItem = {
  id: string;
  productId: string;
  quantity: string | number;
  unitPrice: string | number;
  note: string | null;
  status: string;
  product: Product;
};
type Order = {
  id: string;
  number: string;
  status: string;
  guests: number;
  openedAt: string;
  items: OrderItem[];
  table: { id: string; name: string };
};
type DiningTable = {
  id: string;
  code: string;
  name: string;
  seats: number;
  status: string;
  sortOrder: number;
  isActive: boolean;
  orders: Order[];
};
type Area = { id: string; code: string; name: string; isActive: boolean; tables: DiningTable[] };
type ManagedTable = Omit<DiningTable, "orders"> & { _count: { orders: number } };
type ManagedArea = Omit<Area, "tables"> & { tables: ManagedTable[] };
type KitchenTicket = {
  id: string;
  number: string;
  status: string;
  sentAt: string;
  order: { table: { id: string; name: string } };
  items: Array<{ orderItem: OrderItem }>;
};
type InvoiceMode = "NONE" | "PAPER" | "MOBILE_CARRIER" | "CITIZEN_CERT" | "DONATION" | "BUSINESS";
type Bootstrap = {
  registers: Array<{ id: string; code: string; name: string; warehouseId: string }>;
  openShift: { id: string; register: { name: string; warehouseId: string } } | null;
  areas: Area[];
  categories: Array<{ id: string; name: string }>;
  products: Product[];
  kitchenTickets: KitchenTicket[];
  canManageTables: boolean;
  tableSettings: ManagedArea[];
};

const money = (amount: number) => new Intl.NumberFormat("zh-TW", {
  style: "currency",
  currency: "TWD",
  maximumFractionDigits: 0,
}).format(amount);
const ACTIVE = new Set(["OPEN", "SENT", "PREPARING", "READY"]);
const RESTAURANT_BOOTSTRAP_CACHE_TTL_MS = 15_000;

function readRestaurantBootstrapCache(): Bootstrap | null {
  try {
    const raw = window.sessionStorage.getItem("erin-restaurant-front-bootstrap");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed.data || Date.now() - Number(parsed.savedAt || 0) > RESTAURANT_BOOTSTRAP_CACHE_TTL_MS) return null;
    return parsed.data as Bootstrap;
  } catch {
    return null;
  }
}

function writeRestaurantBootstrapCache(data: Bootstrap) {
  try {
    window.sessionStorage.setItem("erin-restaurant-front-bootstrap", JSON.stringify({ savedAt: Date.now(), data }));
  } catch {}
}


export function RestaurantWorkspace({ kitchenOnly = false, canManageTables = false }: {
  kitchenOnly?: boolean;
  canManageTables?: boolean;
}) {
  const { data: activeSession } = useSession();
  const [data, setData] = useState<Bootstrap | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [selectedTableId, setSelectedTableId] = useState("");
  const [guests, setGuests] = useState(2);
  const [registerId, setRegisterId] = useState("");
  const [openingCash, setOpeningCash] = useState("0");
  const [categoryId, setCategoryId] = useState("ALL");
  const [query, setQuery] = useState("");
  const [lastSaleId, setLastSaleId] = useState("");
  const [lastKitchenTicketId, setLastKitchenTicketId] = useState("");
  const [autoPrintKitchen, setAutoPrintKitchen] = useState(true);
  const [invoiceMode, setInvoiceMode] = useState<InvoiceMode>("NONE");
  const [invoiceBuyerTaxId, setInvoiceBuyerTaxId] = useState("");
  const [invoiceCarrierId, setInvoiceCarrierId] = useState("");
  const [invoiceDonationCode, setInvoiceDonationCode] = useState("");
  const [tableManagerOpen, setTableManagerOpen] = useState(false);
  const sessionPermissions = activeSession?.user?.permissions ?? [];
  const allowTableManagement = canManageTables || sessionPermissions.includes("*") || sessionPermissions.includes("restaurant.manage");

  const load = useCallback(async () => {
    const cached = kitchenOnly ? null : readRestaurantBootstrapCache();
    if (cached) {
      setData(cached);
      setRegisterId((value) => value || cached.registers[0]?.id || "");
      setLoading(false);
    }
    try {
      const response = await fetch(`/api/pos/restaurant?view=${kitchenOnly ? "kitchen" : "front"}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "無法載入餐飲 POS");
      setData(result);
      if (!kitchenOnly) writeRestaurantBootstrapCache(result);
      setRegisterId((value) => value || result.registers[0]?.id || "");
    } catch (error) {
      if (!cached) toast.error(error instanceof Error ? error.message : "無法載入餐飲 POS");
    } finally {
      setLoading(false);
    }
  }, [kitchenOnly]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("erp_restaurant_auto_print_kitchen");
      if (saved !== null) setAutoPrintKitchen(saved === "1");
    } catch {}
  }, []);
  useEffect(() => {
    if (!kitchenOnly) return;
    const id = window.setInterval(() => void load(), 10_000);
    return () => window.clearInterval(id);
  }, [kitchenOnly, load]);

  const tables = useMemo(() => data?.areas.flatMap((area) => area.tables) ?? [], [data]);
  const selectedTable = tables.find((table) => table.id === selectedTableId) ?? null;
  const selectedOrder = selectedTable?.orders.find((order) => ACTIVE.has(order.status)) ?? null;
  const filteredProducts = useMemo(() => (data?.products ?? []).filter((product) => {
    const categoryMatches = categoryId === "ALL" || product.categoryId === categoryId;
    const needle = query.trim().toLowerCase();
    return categoryMatches && (!needle || `${product.sku} ${product.name}`.toLowerCase().includes(needle));
  }), [categoryId, data, query]);
  const orderTotal = (selectedOrder?.items ?? [])
    .filter((item) => item.status !== "CANCELLED")
    .reduce((sum, item) => sum + Number(item.quantity) * Number(item.unitPrice), 0);

  function updateOrderLocally(orderId: string, updater: (order: Order) => Order) {
    setData((current) => current ? {
      ...current,
      areas: current.areas.map((area) => ({
        ...area,
        tables: area.tables.map((table) => ({
          ...table,
          orders: table.orders.map((order) => order.id === orderId ? updater(order) : order),
        })),
      })),
    } : current);
  }

  async function action(payload: Record<string, unknown>, success?: string, refresh = true) {
    setBusy(true);
    try {
      const response = await fetch("/api/pos/restaurant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "操作失敗");
      if (success) toast.success(success);
      if (refresh) await load();
      return result;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "操作失敗");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function openTable(table: DiningTable) {
    if (!data?.openShift) return;
    const result = await action({
      action: "OPEN_TABLE",
      tableId: table.id,
      shiftId: data.openShift.id,
      guests,
    }, "開桌完成", false);
    if (!result?.order) return;

    setData((current) => current ? {
      ...current,
      areas: current.areas.map((area) => ({
        ...area,
        tables: area.tables.map((row) => row.id === table.id
          ? {
              ...row,
              status: "OCCUPIED",
              orders: [result.order, ...row.orders.filter((order) => order.id !== result.order.id)],
            }
          : row),
      })),
    } : current);
  }

  async function addItem(product: Product) {
    if (!selectedOrder) return;
    const result = await action({
      action: "ADD_ITEM",
      orderId: selectedOrder.id,
      productId: product.id,
      quantity: 1,
      note: "",
    }, undefined, false);
    if (!result?.item) return;

    updateOrderLocally(selectedOrder.id, (order) => {
      const exists = order.items.some((item) => item.id === result.item.id);
      return {
        ...order,
        items: exists
          ? order.items.map((item) => item.id === result.item.id ? result.item : item)
          : [...order.items, result.item],
      };
    });
  }

  async function updateItem(item: OrderItem, quantity: number) {
    if (!selectedOrder) return;
    const result = await action({
      action: "UPDATE_ITEM",
      itemId: item.id,
      quantity,
      note: item.note ?? "",
    }, undefined, false);
    if (!result) return;

    updateOrderLocally(selectedOrder.id, (order) => ({
      ...order,
      items: result.deleted
        ? order.items.filter((row) => row.id !== item.id)
        : order.items.map((row) => row.id === item.id ? result.item : row),
    }));
  }

  async function sendKitchen() {
    if (!selectedOrder) return;
    const pendingItems = selectedOrder.items.filter((item) => item.status === "PENDING");
    if (!pendingItems.length) return;

    const printWindow = autoPrintKitchen ? window.open("about:blank", "_blank") : null;
    if (printWindow) printWindow.opener = null;
    const result = await action({ action: "SEND_KITCHEN", orderId: selectedOrder.id }, "已送至廚房", false);
    if (!result?.ticket) {
      printWindow?.close();
      return;
    }

    const pendingIds = new Set(pendingItems.map((item) => item.id));
    updateOrderLocally(selectedOrder.id, (order) => ({
      ...order,
      status: "SENT",
      items: order.items.map((item) => pendingIds.has(item.id) ? { ...item, status: "SENT" } : item),
    }));
    setLastKitchenTicketId(result.ticket.id);

    if (printWindow) printWindow.location.href = `/print/kitchen/${result.ticket.id}`;
  }

  function changeAutoPrint(value: boolean) {
    setAutoPrintKitchen(value);
    try {
      window.localStorage.setItem("erp_restaurant_auto_print_kitchen", value ? "1" : "0");
    } catch {}
  }

  async function openShift() {
    setBusy(true);
    try {
      const response = await fetch("/api/pos/shifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "OPEN", registerId, openingCash: Number(openingCash || 0) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "開班失敗");
      toast.success("餐飲門市已開班");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "開班失敗");
    } finally {
      setBusy(false);
    }
  }

  async function checkout(method: "CASH" | "CARD") {
    if (!data?.openShift || !selectedOrder || orderTotal <= 0) return;
    if (selectedOrder.items.some((item) => item.status === "PENDING")) {
      toast.error("請先把所有餐點送廚，再進行結帳");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/pos/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: crypto.randomUUID(),
          shiftId: data.openShift.id,
          restaurantOrderId: selectedOrder.id,
          items: selectedOrder.items
            .filter((item) => item.status !== "CANCELLED")
            .map((item) => ({ productId: item.productId, quantity: Number(item.quantity), discount: 0 })),
          payments: [{ method, amount: orderTotal }],
          invoice: invoiceMode === "NONE" ? null : {
            mode: invoiceMode,
            buyerTaxId: invoiceBuyerTaxId.trim() || null,
            carrierId: invoiceCarrierId.trim().toUpperCase() || null,
            donationCode: invoiceDonationCode.trim() || null,
          },
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "結帳失敗");
      const completedOrderId = selectedOrder.id;
      const completedTableId = selectedTable?.id;
      const soldByProduct = new Map<string, number>();
      for (const item of selectedOrder.items) {
        if (item.status === "CANCELLED") continue;
        soldByProduct.set(item.productId, (soldByProduct.get(item.productId) ?? 0) + Number(item.quantity));
      }
      setData((current) => current ? {
        ...current,
        products: current.products.map((product) => ({
          ...product,
          stockTotal: Math.max(0, product.stockTotal - (soldByProduct.get(product.id) ?? 0)),
        })),
        areas: current.areas.map((area) => ({
          ...area,
          tables: area.tables.map((table) => table.id === completedTableId
            ? { ...table, status: "AVAILABLE", orders: table.orders.filter((order) => order.id !== completedOrderId) }
            : table),
        })),
      } : current);
      setLastSaleId(result.sale.id);
      setSelectedTableId("");
      toast.success(`結帳完成：${result.sale.number}`);
      window.setTimeout(() => void load(), 1_200);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "結帳失敗");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
return <div className="grid min-h-[60vh] animate-pulse gap-4 xl:grid-cols-[280px_minmax(0,1fr)_380px]" aria-label="正在載入餐飲 POS">
      <div className="rounded-2xl bg-muted" /><div className="grid grid-cols-2 gap-3 md:grid-cols-3">{Array.from({ length: 9 }).map((_, index) => <div key={index} className="h-36 rounded-2xl bg-muted" />)}</div><div className="rounded-2xl bg-muted" />
    </div>;
  }
  if (!data) return <div className="rounded-xl border p-8 text-center">無法載入餐飲 POS</div>;

  if (kitchenOnly) {
    return <KitchenBoard
      tickets={data.kitchenTickets}
      busy={busy}
      refresh={load}
      update={(itemId, status) => action({ action: "SET_ITEM_STATUS", itemId, status })}
    />;
  }

  if (!data.openShift) {
    return (
      <div>
        <div className="mx-auto mt-10 max-w-xl space-y-6 rounded-3xl border bg-card p-7 shadow-lg">
          <div className="text-center">
            <Store className="mx-auto h-12 w-12 text-orange-500" />
            <h1 className="mt-3 text-2xl font-black">餐飲 POS 開班</h1>
            <p className="mt-2 text-sm text-muted-foreground">確認收銀台與備用金後，才可開桌與點餐。</p>
          </div>
          <label className="block text-sm font-medium">
            收銀台
            <select value={registerId} onChange={(event) => setRegisterId(event.target.value)} className="mt-1 h-11 w-full rounded-lg border bg-background px-3">
              {data.registers.map((register) => <option key={register.id} value={register.id}>{register.code}・{register.name}</option>)}
            </select>
          </label>
          <label className="block text-sm font-medium">
            備用金
            <input value={openingCash} onChange={(event) => setOpeningCash(event.target.value)} inputMode="numeric" className="mt-1 h-11 w-full rounded-lg border bg-background px-3" />
          </label>
          <button onClick={openShift} disabled={busy || !registerId} data-shortcut="save" className="h-12 w-full rounded-xl bg-orange-600 font-bold text-white disabled:opacity-50">
            {busy ? "處理中…" : "確認開班"}
          </button>
          {allowTableManagement && <button onClick={() => setTableManagerOpen(true)} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-orange-200 bg-orange-50 text-sm font-bold text-orange-800 dark:border-orange-900 dark:bg-orange-950/30 dark:text-orange-200"><Settings2 className="h-4 w-4" />尚未開班，仍可先設定桌位</button>}
        </div>
        {allowTableManagement && <TableManager open={tableManagerOpen} onOpenChange={setTableManagerOpen} areas={data.tableSettings ?? []} busy={busy} onAction={action} />}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-col justify-between gap-4 rounded-2xl bg-slate-950 p-5 text-white shadow-xl lg:flex-row lg:items-center">
        <div>
          <div className="text-[11px] font-black uppercase tracking-[.22em] text-orange-400">RESTAURANT POS / FRONT</div><h1 className="mt-1 flex items-center gap-2 text-2xl font-black"><UtensilsCrossed className="h-5 w-5 text-orange-400" />桌位、點餐與廚房同步</h1>
          <p className="mt-1 text-sm text-slate-300">{data.openShift.register.name}・顏色辨識桌況，一個畫面完成開桌、加點、送廚與結帳</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {allowTableManagement && <button onClick={() => setTableManagerOpen(true)} className="inline-flex h-10 items-center gap-2 rounded-lg border border-orange-200 bg-orange-50 px-3 text-sm font-bold text-orange-800 dark:border-orange-900 dark:bg-orange-950/30 dark:text-orange-200"><Settings2 className="h-4 w-4" />桌位設定</button>}
          <Link href="/pos/restaurant/kitchen" className="inline-flex h-10 items-center gap-2 rounded-lg bg-white px-4 text-sm font-bold text-slate-950"><ChefHat className="h-4 w-4" />廚房看板</Link>
          <button onClick={() => void load()} className="inline-flex h-10 items-center gap-2 rounded-lg border border-white/20 px-3 text-sm text-white"><RefreshCw className="h-4 w-4" />重新整理</button>
        </div>
      </header>

      {allowTableManagement && <TableManager open={tableManagerOpen} onOpenChange={setTableManagerOpen} areas={data.tableSettings ?? []} busy={busy} onAction={action} />}

      <div className="grid gap-4 xl:grid-cols-[220px_minmax(0,1fr)_350px]">
        <section className="rounded-2xl border bg-card p-4">
          <div className="mb-1 flex items-center justify-between font-bold"><span>桌位狀態</span><span className="text-[10px] font-normal text-muted-foreground"><i className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-orange-500" />即時同步</span></div><div className="mb-3 text-[11px] text-muted-foreground">點選桌位立即切換訂單</div>
          <div className="space-y-5">
            {data.areas.map((area) => <div key={area.id}>
              <div className="mb-2 text-xs font-semibold text-muted-foreground">{area.name}</div>
              <div className="grid grid-cols-2 gap-2">{area.tables.map((table) => {
                const active = table.id === selectedTableId;
                const occupied = table.orders.some((order) => ACTIVE.has(order.status));
                return <button key={table.id} onClick={() => setSelectedTableId(table.id)} className={`min-h-20 rounded-xl border p-2 text-left transition ${active ? "border-orange-500 ring-2 ring-orange-200" : occupied ? "border-rose-200 bg-rose-50 dark:bg-rose-950/20" : "hover:border-emerald-400"}`}>
                  <div className="font-bold">{table.name}</div>
                  <div className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground"><Users className="h-3 w-3" />{table.seats} 位・{occupied ? "用餐中" : "空桌"}</div>
                </button>;
              })}</div>
            </div>)}
          </div>
        </section>

        <section className="rounded-2xl border bg-card p-4">
          <label className="relative block">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜尋餐點／貨號（F2）" className="h-10 w-full rounded-lg border bg-background pl-9 pr-3" />
          </label>
          <div className="my-3 flex gap-2 overflow-x-auto pb-1">
            <button onClick={() => setCategoryId("ALL")} className={`shrink-0 rounded-full px-3 py-1.5 text-xs ${categoryId === "ALL" ? "bg-orange-600 text-white" : "border"}`}>全部</button>
            {data.categories.map((category) => <button key={category.id} onClick={() => setCategoryId(category.id)} className={`shrink-0 rounded-full px-3 py-1.5 text-xs ${categoryId === category.id ? "bg-orange-600 text-white" : "border"}`}>{category.name}</button>)}
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-4">
            {filteredProducts.map((product) => <button key={product.id} disabled={!selectedOrder || busy} onClick={() => void addItem(product)} className="overflow-hidden rounded-xl border bg-background text-left transition hover:-translate-y-0.5 hover:border-orange-400 disabled:opacity-50">
              <div className="aspect-[4/3] bg-gradient-to-br from-orange-100 to-amber-50 dark:from-orange-950 dark:to-slate-900">
                {product.imageUrl ? <img src={product.imageUrl} alt={product.name} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-3xl font-black text-orange-300">{product.name.slice(0, 1)}</div>}
              </div>
              <div className="p-3">
                <div className="line-clamp-2 min-h-10 text-sm font-bold">{product.name}</div>
                <div className="mt-1 flex justify-between text-xs"><span className="font-semibold text-orange-600">{money(product.salePrice)}</span><span className="text-muted-foreground">庫 {product.stockTotal}</span></div>
              </div>
            </button>)}
          </div>
        </section>

        <section className="rounded-2xl border bg-card p-4">
          {!selectedTable ? (
            <div className="flex min-h-[480px] flex-col items-center justify-center text-center text-muted-foreground">
              <UtensilsCrossed className="h-12 w-12 opacity-30" />
              <div className="mt-3 font-bold">請先選擇桌位</div>
              <div className="mt-1 text-xs">空桌可開桌，用餐桌可繼續加點</div>
            </div>
          ) : !selectedOrder ? (
            <div className="flex min-h-[480px] flex-col items-center justify-center text-center">
              <div className="text-lg font-black">{selectedTable.name}</div>
              <p className="mt-1 text-sm text-muted-foreground">目前是空桌</p>
              <label className="mt-5 text-sm">用餐人數<input type="number" min={1} max={99} value={guests} onChange={(event) => setGuests(Number(event.target.value))} className="ml-2 h-10 w-20 rounded-lg border px-2" /></label>
              <button disabled={busy} data-shortcut="new" onClick={() => void openTable(selectedTable)} className="mt-4 h-11 rounded-xl bg-orange-600 px-8 font-bold text-white">開桌點餐</button>
            </div>
          ) : (
            <div className="flex min-h-[540px] flex-col">
              <div className="flex items-center justify-between border-b pb-3">
                <div><div className="font-black">{selectedTable.name}・{selectedOrder.number}</div><div className="mt-1 text-xs text-muted-foreground">{selectedOrder.guests} 位・{selectedOrder.status}</div></div>
                <Clock3 className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="flex-1 space-y-2 overflow-y-auto py-3">
                {selectedOrder.items.map((item) => <div key={item.id} className="rounded-xl border p-3">
                  <div className="flex justify-between gap-3">
                    <div className="flex min-w-0 gap-3">{resolveDemoProductImage(item.product.sku, item.product.imageUrl) ? <img src={resolveDemoProductImage(item.product.sku, item.product.imageUrl) ?? undefined} alt={item.product.name} className="h-12 w-12 shrink-0 rounded-lg object-cover" /> : <div className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-orange-50 font-black text-orange-300">{item.product.name.slice(0, 1)}</div>}<div className="min-w-0"><div className="truncate text-sm font-bold">{item.product.name}</div><div className="mt-1 text-[11px] text-muted-foreground">{item.status}{item.note ? `・${item.note}` : ""}</div></div></div>
                    <div className="text-sm font-semibold">{money(Number(item.quantity) * Number(item.unitPrice))}</div>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <button disabled={item.status !== "PENDING" || busy} onClick={() => void updateItem(item, Math.max(0, Number(item.quantity) - 1))} className="h-7 w-7 rounded border disabled:opacity-30"><Minus className="mx-auto h-3 w-3" /></button>
                    <span className="w-8 text-center text-sm font-bold">{Number(item.quantity)}</span>
                    <button disabled={item.status !== "PENDING" || busy} onClick={() => void updateItem(item, Number(item.quantity) + 1)} className="h-7 w-7 rounded border disabled:opacity-30"><Plus className="mx-auto h-3 w-3" /></button>
                  </div>
                </div>)}
              </div>
              <div className="space-y-3 border-t pt-3">
                <div className="flex items-end justify-between"><span className="text-sm text-muted-foreground">桌單總額</span><span className="text-2xl font-black">{money(orderTotal)}</span></div>
                <button disabled={busy || !selectedOrder.items.some((item) => item.status === "PENDING")} onClick={() => void sendKitchen()} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 font-bold text-white disabled:opacity-40"><Send className="h-4 w-4" />送廚房</button>
                <label className="flex items-center justify-between rounded-lg border px-3 py-2 text-xs">
                  <span className="inline-flex items-center gap-2"><Printer className="h-4 w-4" />送廚後自動列印 80mm 廚房單</span>
                  <input type="checkbox" checked={autoPrintKitchen} onChange={(event) => changeAutoPrint(event.target.checked)} className="h-4 w-4 accent-orange-600" />
                </label>
                {lastKitchenTicketId && <button onClick={() => window.open(`/print/kitchen/${lastKitchenTicketId}`, "_blank", "noopener,noreferrer")} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border text-sm"><Printer className="h-4 w-4" />列印上一張廚房單</button>}
                <div className="space-y-2 rounded-xl border bg-muted/30 p-3">
                  <label className="text-xs font-bold">電子發票／收據
                    <select value={invoiceMode} onChange={(event) => setInvoiceMode(event.target.value as InvoiceMode)} className="mt-1 h-9 w-full rounded-lg border bg-background px-2 text-sm">
                      <option value="NONE">不開立電子發票</option><option value="PAPER">一般電子發票（印證明聯）</option><option value="MOBILE_CARRIER">手機條碼載具</option><option value="CITIZEN_CERT">自然人憑證載具</option><option value="DONATION">捐贈碼</option><option value="BUSINESS">公司統編</option>
                    </select>
                  </label>
                  {(invoiceMode === "MOBILE_CARRIER" || invoiceMode === "CITIZEN_CERT") && <input value={invoiceCarrierId} onChange={(event) => setInvoiceCarrierId(event.target.value.toUpperCase())} placeholder={invoiceMode === "MOBILE_CARRIER" ? "手機條碼，例如 /ABC1234" : "自然人憑證載具號碼"} className="h-9 w-full rounded-lg border bg-background px-3 text-sm font-mono uppercase" />}
                  {invoiceMode === "DONATION" && <input value={invoiceDonationCode} onChange={(event) => setInvoiceDonationCode(event.target.value.replace(/\D/g, ""))} placeholder="捐贈碼（3–7 碼）" inputMode="numeric" className="h-9 w-full rounded-lg border bg-background px-3 text-sm" />}
                  {invoiceMode === "BUSINESS" && <input value={invoiceBuyerTaxId} onChange={(event) => setInvoiceBuyerTaxId(event.target.value.replace(/\D/g, "").slice(0, 8))} placeholder="買方統一編號（8 碼）" inputMode="numeric" className="h-9 w-full rounded-lg border bg-background px-3 text-sm" />}
                  {invoiceMode !== "NONE" && <div className="text-[10px] leading-relaxed text-muted-foreground">目前為開票佇列與欄位模擬；正式上線仍須財政部 Turnkey／VAN 憑證、字軌及測試平台驗證。</div>}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button disabled={busy || orderTotal <= 0} onClick={() => void checkout("CASH")} className="h-11 rounded-xl bg-emerald-600 font-bold text-white">現金結帳</button>
                  <button disabled={busy || orderTotal <= 0} onClick={() => void checkout("CARD")} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-indigo-600 font-bold text-white"><CreditCard className="h-4 w-4" />刷卡結帳</button>
                </div>
                {lastSaleId && <button onClick={() => window.open(`/print/pos/${lastSaleId}`, "_blank", "noopener,noreferrer")} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border text-sm"><ReceiptText className="h-4 w-4" />列印上一筆 80mm 收據</button>}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

type TableForm = { areaId: string; code: string; name: string; seats: number; sortOrder: number };

function TableManager({ open, onOpenChange, areas, busy, onAction }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  areas: ManagedArea[];
  busy: boolean;
  onAction: (payload: Record<string, unknown>, success?: string) => Promise<any>;
}) {
  const [editingId, setEditingId] = useState("");
  const [form, setForm] = useState<TableForm>({ areaId: "", code: "", name: "", seats: 4, sortOrder: 1 });
  const allTables = areas.flatMap((area) => area.tables);

  useEffect(() => {
    if (open && !form.areaId && areas[0]) setForm((current) => ({ ...current, areaId: areas[0].id }));
  }, [areas, form.areaId, open]);

  function startCreate() {
    const usedCodes = new Set(allTables.map((table) => table.code.toUpperCase()));
    let number = Math.max(1, allTables.length + 1);
    while (usedCodes.has(`T${String(number).padStart(2, "0")}`)) number += 1;
    setEditingId("");
    setForm({
      areaId: areas.find((area) => area.isActive)?.id ?? areas[0]?.id ?? "",
      code: `T${String(number).padStart(2, "0")}`,
      name: `${number} 號桌`,
      seats: 4,
      sortOrder: Math.max(0, ...allTables.map((table) => table.sortOrder)) + 1,
    });
  }

  function startEdit(table: ManagedTable) {
    setEditingId(table.id);
    setForm({
      areaId: areas.find((area) => area.tables.some((item) => item.id === table.id))?.id ?? "",
      code: table.code,
      name: table.name,
      seats: table.seats,
      sortOrder: table.sortOrder,
    });
  }

  async function saveTable(event: React.FormEvent) {
    event.preventDefault();
    const result = await onAction({
      action: editingId ? "UPDATE_TABLE" : "CREATE_TABLE",
      ...(editingId ? { tableId: editingId } : {}),
      ...form,
    }, editingId ? "桌位資料已更新" : "新桌位已新增");
    if (result) startCreate();
  }

  async function toggleTable(table: ManagedTable) {
    await onAction({ action: "SET_TABLE_ACTIVE", tableId: table.id, isActive: !table.isActive }, table.isActive ? "桌位已停用" : "桌位已恢復");
  }

  async function removeTable(table: ManagedTable) {
    const message = table._count.orders > 0
      ? `${table.name} 已有歷史交易，刪除後將改為停用並保留所有單據。確定繼續？`
      : `確定刪除尚未使用的桌位「${table.name}」？`;
    if (!window.confirm(message)) return;
    const result = await onAction({ action: "DELETE_TABLE", tableId: table.id });
    if (result) toast.success(result.mode === "ARCHIVED" ? "桌位已有歷史交易，已安全停用" : "桌位已刪除");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>餐飲桌位設定</DialogTitle>
          <DialogDescription>只有具備餐飲全部管理權限者可修改。已有歷史交易的桌位只會停用，不會破壞舊桌單。</DialogDescription>
        </DialogHeader>

        <form onSubmit={saveTable} className="grid gap-3 rounded-xl border bg-muted/20 p-4 md:grid-cols-6">
          <label className="text-xs font-bold md:col-span-2">用餐區域<select required value={form.areaId} onChange={(event) => setForm({ ...form, areaId: event.target.value })} className="mt-1 h-10 w-full rounded-lg border bg-background px-3 text-sm">{areas.filter((area) => area.isActive).map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}</select></label>
          <label className="text-xs font-bold">桌位代碼<input required maxLength={20} value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, "") })} className="mt-1 h-10 w-full rounded-lg border bg-background px-3 font-mono text-sm uppercase" /></label>
          <label className="text-xs font-bold md:col-span-2">顯示名稱<input required maxLength={40} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="mt-1 h-10 w-full rounded-lg border bg-background px-3 text-sm" /></label>
          <label className="text-xs font-bold">座位數<input required type="number" min={1} max={99} value={form.seats} onChange={(event) => setForm({ ...form, seats: Number(event.target.value) })} className="mt-1 h-10 w-full rounded-lg border bg-background px-3 text-sm" /></label>
          <label className="text-xs font-bold md:col-span-2">顯示順序<input required type="number" min={0} max={9999} value={form.sortOrder} onChange={(event) => setForm({ ...form, sortOrder: Number(event.target.value) })} className="mt-1 h-10 w-full rounded-lg border bg-background px-3 text-sm" /></label>
          <div className="flex items-end gap-2 md:col-span-4"><button type="submit" disabled={busy || !form.areaId || !form.code.trim() || !form.name.trim()} className="h-10 rounded-lg bg-orange-600 px-5 text-sm font-bold text-white disabled:opacity-40">{editingId ? "儲存修改" : "新增桌位"}</button><button type="button" disabled={busy} onClick={startCreate} className="h-10 rounded-lg border px-4 text-sm">清除／新增另一桌</button></div>
        </form>

        <div className="max-h-[48vh] space-y-5 overflow-y-auto pr-1">
          {areas.map((area) => <section key={area.id}>
            <div className="mb-2 flex items-center justify-between"><div className="font-bold">{area.name}</div><div className="text-xs text-muted-foreground">{area.tables.filter((table) => table.isActive).length} 張啟用</div></div>
            <div className="grid gap-2 sm:grid-cols-2">{area.tables.map((table) => <div key={table.id} className={`flex items-center justify-between gap-3 rounded-xl border p-3 ${table.isActive ? "bg-background" : "bg-muted/40 opacity-70"}`}>
              <div className="min-w-0"><div className="truncate font-bold">{table.name} <span className="font-mono text-xs font-normal text-muted-foreground">{table.code}</span></div><div className="mt-1 text-xs text-muted-foreground">{table.seats} 位・順序 {table.sortOrder}・{table.status === "OCCUPIED" ? "用餐中" : table.isActive ? "使用中" : "已停用"}{table._count.orders > 0 ? `・${table._count.orders} 筆歷史桌單` : "・尚無交易"}</div></div>
              <div className="flex shrink-0 gap-1"><button type="button" disabled={busy} title="編輯桌位" onClick={() => startEdit(table)} className="h-9 w-9 rounded-lg border hover:bg-muted"><Pencil className="mx-auto h-4 w-4" /></button><button type="button" disabled={busy || table.status === "OCCUPIED"} title={table.isActive ? "停用桌位" : "恢復桌位"} onClick={() => void toggleTable(table)} className="h-9 w-9 rounded-lg border hover:bg-muted"><ArchiveRestore className="mx-auto h-4 w-4" /></button><button type="button" disabled={busy || table.status === "OCCUPIED"} title="安全刪除桌位" onClick={() => void removeTable(table)} className="h-9 w-9 rounded-lg border text-rose-600 hover:bg-rose-50"><Trash2 className="mx-auto h-4 w-4" /></button></div>
            </div>)}</div>
          </section>)}
          {areas.length === 0 && <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">目前沒有可用的用餐區域，請先聯絡系統管理者建立區域。</div>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function KitchenBoard({ tickets, busy, refresh, update }: {
  tickets: KitchenTicket[];
  busy: boolean;
  refresh: () => Promise<void>;
  update: (itemId: string, status: "PREPARING" | "READY" | "SERVED") => Promise<any>;
}) {
  return <div className="space-y-4">
    <header className="flex flex-col justify-between gap-3 rounded-2xl bg-slate-950 p-5 text-white md:flex-row md:items-center">
      <div><h1 className="flex items-center gap-2 text-2xl font-black"><ChefHat className="h-6 w-6 text-orange-400" />廚房出餐看板</h1><p className="mt-1 text-xs text-slate-400">每 10 秒自動更新；狀態同步外場桌單</p></div>
      <div className="flex gap-2"><Link href="/pos/restaurant" className="h-10 rounded-lg border border-white/20 px-4 py-2 text-sm">回點餐</Link><button onClick={() => void refresh()} className="inline-flex h-10 items-center gap-2 rounded-lg bg-white px-4 text-sm font-bold text-slate-950"><RefreshCw className="h-4 w-4" />更新</button></div>
    </header>
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {tickets.map((ticket) => <article key={ticket.id} className={`rounded-2xl border-2 bg-card p-4 shadow-sm ${ticket.status === "READY" ? "border-emerald-400" : ticket.status === "PREPARING" ? "border-orange-400" : "border-slate-300"}`}>
        <div className="flex justify-between gap-3"><div><div className="text-lg font-black">{ticket.order.table.name}</div><div className="text-xs text-muted-foreground">{ticket.number}</div></div><div className="flex items-start gap-2"><button onClick={() => window.open(`/print/kitchen/${ticket.id}`, "_blank", "noopener,noreferrer")} title="列印廚房單" className="rounded-lg border p-2"><Printer className="h-4 w-4" /></button><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">{ticket.status}</span></div></div>
        <div className="mt-4 space-y-3">{ticket.items.map(({ orderItem }) => <div key={orderItem.id} className="rounded-xl border p-3">
          <div className="flex justify-between gap-2"><div className="font-bold">{Number(orderItem.quantity)} × {orderItem.product.name}</div><span className="text-xs text-muted-foreground">{orderItem.status}</span></div>
          {orderItem.note && <div className="mt-1 text-sm font-semibold text-rose-600">備註：{orderItem.note}</div>}
          <div className="mt-3 flex gap-2">{orderItem.status === "SENT" && <button disabled={busy} onClick={() => void update(orderItem.id, "PREPARING")} className="flex-1 rounded-lg bg-orange-500 px-2 py-2 text-xs font-bold text-white">開始製作</button>}{["SENT", "PREPARING"].includes(orderItem.status) && <button disabled={busy} onClick={() => void update(orderItem.id, "READY")} className="flex-1 rounded-lg bg-emerald-600 px-2 py-2 text-xs font-bold text-white">完成待出</button>}{orderItem.status === "READY" && <button disabled={busy} onClick={() => void update(orderItem.id, "SERVED")} className="flex-1 rounded-lg bg-indigo-600 px-2 py-2 text-xs font-bold text-white">已出餐</button>}</div>
        </div>)}</div>
      </article>)}
      {tickets.length === 0 && <div className="col-span-full rounded-2xl border border-dashed p-16 text-center text-muted-foreground"><ChefHat className="mx-auto h-12 w-12 opacity-30" /><div className="mt-3 font-bold">目前沒有待製作餐點</div></div>}
    </div>
  </div>;
}
