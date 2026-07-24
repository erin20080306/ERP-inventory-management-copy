"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  ArchiveRestore,
  Banknote,
  CheckCircle2,
  ChefHat,
  Clock3,
  CircleDollarSign,
  CreditCard,
  Loader2,
  Minus,
  Pencil,
  Plus,
  Printer,
  ReceiptText,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  ShieldCheck,
  Settings2,
  Store,
  Trash2,
  Users,
  UtensilsCrossed,
  X,
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
  cancelReason?: string | null;
  cancelDisposition?: "NOT_PREPARED" | "WASTE" | null;
  cancelledAt?: string | null;
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
  startedAt: string | null;
  readyAt: string | null;
  servedAt: string | null;
  cancelledAt?: string | null;
  order: { table: { id: string; name: string } };
  items: Array<{ orderItem: OrderItem }>;
};
type InvoiceMode = "NONE" | "PAPER" | "MOBILE_CARRIER" | "CITIZEN_CERT" | "DONATION" | "BUSINESS";
type ShiftSummary = { openingCash: number; expectedCash: number; difference: number | null; openedBy: { id: string; name: string; username: string }; closingBy: { id: string; name: string; username: string }; netSales: number; saleCount: number; refundCount: number };
type CashMovement = { id: string; type: "PAID_IN" | "PAID_OUT" | "SAFE_DROP"; status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED"; amount: number | string; reason: string; requestedById: string; approvedById?: string | null; requestedAt: string };
type Bootstrap = {
  registers: Array<{ id: string; code: string; name: string; warehouseId: string }>;
  openShift: { id: string; userId: string; openingCash: number; openedAt: string; openedBy: { id: string; name: string; username: string }; register: { name: string; warehouseId: string } } | null;
  today: { sales: number; refunds: number; grossAmount: number; refundAmount: number; amount: number; soldQuantity: number; refundedQuantity: number; netQuantity: number } | null;
  shiftCash: { openingCash: number; cashSales: number; cashRefunds: number; expectedCash: number } | null;
  ledgerCashBalance: number;
  cashMovements: CashMovement[];
  areas: Area[];
  categories: Array<{ id: string; name: string }>;
  products: Product[];
  kitchenTickets: KitchenTicket[];
  kitchenHistory?: boolean;
  canManageTables: boolean;
  tableSettings: ManagedArea[];
};

const money = (amount: number) => new Intl.NumberFormat("zh-TW", {
  style: "currency",
  currency: "TWD",
  maximumFractionDigits: 0,
}).format(amount);
const ACTIVE = new Set(["OPEN", "SENT", "PREPARING", "READY"]);
const CASH_MOVEMENT_LABELS = { PAID_IN: "投入現金", PAID_OUT: "提出現金", SAFE_DROP: "營業中抽離／入庫" } as const;
const OPERATION_STATUS_LABELS: Record<string, string> = { PENDING: "待主管核准", APPROVED: "已核准", REJECTED: "已拒絕", CANCELLED: "已取消" };
const RESTAURANT_BOOTSTRAP_CACHE_TTL_MS = 15_000;

function readRestaurantBootstrapCache(): Bootstrap | null {
  try {
    const raw = window.sessionStorage.getItem("erin-restaurant-front-bootstrap-v2");
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
    window.sessionStorage.setItem("erin-restaurant-front-bootstrap-v2", JSON.stringify({ savedAt: Date.now(), data }));
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
  const [closingCash, setClosingCash] = useState("");
  const [closePreview, setClosePreview] = useState<ShiftSummary | null>(null);
  const [cashPanelOpen, setCashPanelOpen] = useState(false);
  const [cashMovementType, setCashMovementType] = useState<"PAID_IN" | "PAID_OUT" | "SAFE_DROP">("PAID_IN");
  const [cashMovementAmount, setCashMovementAmount] = useState("");
  const [cashMovementReason, setCashMovementReason] = useState("");
  const [categoryId, setCategoryId] = useState("ALL");
  const [query, setQuery] = useState("");
  const [lastSaleId, setLastSaleId] = useState("");
  const [lastPayment, setLastPayment] = useState<{ number: string; method: "CASH" | "CARD"; paidAmount: number; changeDue: number; reference?: string | null } | null>(null);
  const [paymentDialog, setPaymentDialog] = useState<"CASH" | "CARD" | null>(null);
  const [cashReceived, setCashReceived] = useState("");
  const [cardReference, setCardReference] = useState("");
  const [cardApproved, setCardApproved] = useState(false);
  const checkoutRequestIdRef = useRef("");
  const addQueueRef = useRef(new Map<string, { orderId: string; product: Product; queued: number; inFlight: boolean; timer: number | null }>());
  const [lastKitchenTicketId, setLastKitchenTicketId] = useState("");
  const [autoPrintKitchen, setAutoPrintKitchen] = useState(true);
  const [invoiceMode, setInvoiceMode] = useState<InvoiceMode>("NONE");
  const [invoiceBuyerTaxId, setInvoiceBuyerTaxId] = useState("");
  const [invoiceCarrierId, setInvoiceCarrierId] = useState("");
  const [invoiceDonationCode, setInvoiceDonationCode] = useState("");
  const [tableManagerOpen, setTableManagerOpen] = useState(false);
  const [kitchenHistory, setKitchenHistory] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<OrderItem | null>(null);
  const sessionPermissions = activeSession?.user?.permissions ?? [];
  const allowTableManagement = canManageTables || sessionPermissions.includes("*") || sessionPermissions.includes("restaurant.manage");
  const canManageOpeningCash = sessionPermissions.includes("*") || sessionPermissions.includes("cash.approve");
  const canCancelUnprepared = sessionPermissions.includes("*") || sessionPermissions.includes("restaurant.edit");
  const canCancelWaste = sessionPermissions.includes("*") || sessionPermissions.includes("restaurant.approve");
  const canRefundTransactions = (sessionPermissions.includes("*") || sessionPermissions.includes("returns.create")) && (sessionPermissions.includes("*") || sessionPermissions.includes("pos.create"));

  const load = useCallback(async () => {
    const cached = kitchenOnly ? null : readRestaurantBootstrapCache();
    if (cached) {
      setData(cached);
      setRegisterId((value) => value || cached.registers[0]?.id || "");
      setLoading(false);
    }
    try {
      const view = kitchenOnly ? (kitchenHistory ? "kitchen-history" : "kitchen") : "front";
      const response = await fetch(`/api/pos/restaurant?view=${view}`, { cache: "no-store" });
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
  }, [kitchenHistory, kitchenOnly]);
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
  const daily = data?.today ?? { sales: 0, refunds: 0, grossAmount: 0, refundAmount: 0, amount: 0, soldQuantity: 0, refundedQuantity: 0, netQuantity: 0 };
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

  async function action(payload: Record<string, unknown>, success?: string, refresh = true, blocking = true) {
    if (blocking) setBusy(true);
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
      if (blocking) setBusy(false);
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

  function addItem(product: Product) {
    if (!selectedOrder) return;
    const orderId = selectedOrder.id;
    const key = `${orderId}:${product.id}`;

    updateOrderLocally(orderId, (order) => {
      const existing = order.items.find((item) => item.productId === product.id && item.status === "PENDING");
      if (existing) {
        return {
          ...order,
          items: order.items.map((item) => item.id === existing.id
            ? { ...item, quantity: Number(item.quantity) + 1 }
            : item),
        };
      }
      const optimistic: OrderItem = {
        id: `optimistic:${key}`,
        productId: product.id,
        quantity: 1,
        unitPrice: product.salePrice,
        note: null,
        status: "PENDING",
        product,
      };
      return { ...order, items: [...order.items, optimistic] };
    });

    let queued = addQueueRef.current.get(key);
    if (!queued) {
      queued = { orderId, product, queued: 0, inFlight: false, timer: null };
      addQueueRef.current.set(key, queued);
    }
    queued.queued += 1;
    if (!queued.inFlight && queued.timer === null) {
      queued.timer = window.setTimeout(() => void flushAddQueue(key), 60);
    }
  }

  async function flushAddQueue(key: string) {
    const queued = addQueueRef.current.get(key);
    if (!queued || queued.inFlight || queued.queued <= 0) return;
    queued.timer = null;
    const quantity = queued.queued;
    queued.queued = 0;
    queued.inFlight = true;

    const result = await action({
      action: "ADD_ITEM",
      orderId: queued.orderId,
      productId: queued.product.id,
      quantity,
      note: "",
    }, undefined, false, false);

    if (!result?.item) {
      addQueueRef.current.delete(key);
      await load();
      return;
    }

    updateOrderLocally(queued.orderId, (order) => {
      const current = order.items.find((item) => item.productId === queued.product.id && item.status === "PENDING");
      if (!current) return order;
      const shownQuantity = queued.queued > 0 ? Number(current.quantity) : Number(result.item.quantity);
      return {
        ...order,
        items: order.items.map((item) => item.id === current.id
          ? { ...result.item, quantity: shownQuantity }
          : item),
      };
    });

    queued.inFlight = false;
    if (queued.queued > 0) {
      queued.timer = window.setTimeout(() => void flushAddQueue(key), 40);
    } else {
      addQueueRef.current.delete(key);
    }
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

  function requestCancelItem(item: OrderItem) {
    const requiresWaste = !["PENDING", "SENT"].includes(item.status);
    if (requiresWaste && !canCancelWaste) return toast.error("餐點已開始製作，需要餐飲審核權限才能報廢取消");
    if (!requiresWaste && !canCancelUnprepared) return toast.error("需要餐飲編輯權限才能取消餐點");
    setCancelTarget(item);
  }

  async function cancelItem(reason: string, disposition: "NOT_PREPARED" | "WASTE") {
    if (!cancelTarget) return;
    if (disposition === "WASTE" && !canCancelWaste) { toast.error("餐點報廢需要餐飲審核權限"); return; }
    const result = await action({ action: "CANCEL_ITEM", itemId: cancelTarget.id, reason, disposition }, disposition === "WASTE" ? "餐點已取消並登錄報廢" : "餐點已取消並保留稽核紀錄");
    if (result) setCancelTarget(null);
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

  async function requestCashMovement() {
    if (!data?.openShift) return;
    if (Number(cashMovementAmount) <= 0 || cashMovementReason.trim().length < 2) return toast.error("請輸入正確金額與至少 2 個字的原因");
    setBusy(true);
    try {
      const response = await fetch("/api/pos/cash-movements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "REQUEST", shiftId: data.openShift.id, type: cashMovementType, amount: Number(cashMovementAmount), reason: cashMovementReason }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "錢櫃異動申請失敗");
      toast.success(result.message || "已送出主管核准");
      setCashMovementAmount("");
      setCashMovementReason("");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "錢櫃異動申請失敗");
    } finally {
      setBusy(false);
    }
  }

  async function decideCashMovement(movementId: string, decision: "APPROVE" | "REJECT") {
    setBusy(true);
    try {
      const response = await fetch("/api/pos/cash-movements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: decision, movementId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "主管核准失敗");
      toast.success(decision === "APPROVE" ? "錢櫃異動已核准" : "錢櫃異動已拒絕");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "主管核准失敗");
    } finally {
      setBusy(false);
    }
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
      toast.success(result.journal ? `餐飲門市已開班，零用金傳票 ${result.journal.number} 已過帳` : "餐飲門市已開班");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "開班失敗");
    } finally {
      setBusy(false);
    }
  }

  async function previewCloseShift() {
    if (!data?.openShift) return;
    setBusy(true);
    try {
      const response = await fetch("/api/pos/shifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "PREVIEW", shiftId: data.openShift.id }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "結班預覽失敗");
      setClosePreview(result.summary);
      setClosingCash("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "結班預覽失敗");
    } finally {
      setBusy(false);
    }
  }

  async function closeShift() {
    if (!data?.openShift || closingCash === "") return;
    setBusy(true);
    try {
      const response = await fetch("/api/pos/shifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "CLOSE", shiftId: data.openShift.id, closingCash: Number(closingCash) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "結班失敗");
      toast.success(`餐飲門市結班完成，現金差額 ${money(Number(result.summary.difference))}${result.journal ? `；零用金傳票 ${result.journal.number} 已過帳` : ""}`);
      setClosePreview(null);
      setClosingCash("");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "結班失敗");
    } finally {
      setBusy(false);
    }
  }

  function openPaymentDialog(method: "CASH" | "CARD") {
    setPaymentDialog(method);
    setCashReceived("");
    setCardReference("");
    setCardApproved(false);
  }

  async function checkout(method: "CASH" | "CARD", tendered: number, reference?: string) {
    if (!data?.openShift || !selectedOrder || orderTotal <= 0) return;
    if (selectedOrder.items.some((item) => item.status === "PENDING")) {
      toast.error("請先把所有餐點送廚，再進行結帳");
      return;
    }
    if (method === "CASH" && tendered < orderTotal) return toast.error("實收現金不足");
    if (method === "CARD" && (!cardApproved || !reference?.trim())) return toast.error("請確認刷卡機已核准，並輸入授權碼或末四碼");
    setBusy(true);
    try {
      if (!checkoutRequestIdRef.current) checkoutRequestIdRef.current = crypto.randomUUID();
      const response = await fetch("/api/pos/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: checkoutRequestIdRef.current,
          shiftId: data.openShift.id,
          restaurantOrderId: selectedOrder.id,
          items: selectedOrder.items
            .filter((item) => item.status !== "CANCELLED")
            .map((item) => ({ productId: item.productId, quantity: Number(item.quantity), discount: 0 })),
          payments: [{ method, amount: tendered, reference: reference?.trim() || null }],
          invoice: invoiceMode === "NONE" ? null : {
            mode: invoiceMode,
            buyerTaxId: invoiceBuyerTaxId.trim() || null,
            carrierId: invoiceCarrierId.trim().toUpperCase() || null,
            donationCode: invoiceDonationCode.trim() || null,
          },
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        if (response.status >= 400 && response.status < 500) checkoutRequestIdRef.current = "";
        throw new Error(result.error || "結帳失敗");
      }
      const completedOrderId = selectedOrder.id;
      const completedTableId = selectedTable?.id;
      const soldByProduct = new Map<string, number>();
      for (const item of selectedOrder.items) {
        if (item.status === "CANCELLED") continue;
        soldByProduct.set(item.productId, (soldByProduct.get(item.productId) ?? 0) + Number(item.quantity));
      }
      setData((current) => current ? {
        ...current,
        products: current.products.map((product) => ({ ...product, stockTotal: Math.max(0, product.stockTotal - (soldByProduct.get(product.id) ?? 0)) })),
        areas: current.areas.map((area) => ({
          ...area,
          tables: area.tables.map((table) => table.id === completedTableId
            ? { ...table, status: "AVAILABLE", orders: table.orders.filter((order) => order.id !== completedOrderId) }
            : table),
        })),
      } : current);
      setLastSaleId(result.sale.id);
      setLastPayment({ number: result.sale.number, method, paidAmount: tendered, changeDue: Number(result.changeDue), reference: reference?.trim() || null });
      setSelectedTableId("");
      setPaymentDialog(null);
      checkoutRequestIdRef.current = "";
      toast.success(`收款完成：${result.sale.number}；進銷存與帳務背景同步中`);
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
    return <>
      <KitchenBoard
        tickets={data.kitchenTickets}
        busy={busy}
        history={kitchenHistory}
        canCancelUnprepared={canCancelUnprepared}
        canCancelWaste={canCancelWaste}
        refresh={load}
        setHistory={setKitchenHistory}
        cancel={requestCancelItem}
        update={(itemId, status) => action({ action: "SET_ITEM_STATUS", itemId, status })}
      />
      <CancelRestaurantItemDialog item={cancelTarget} busy={busy} canWaste={canCancelWaste} onClose={() => setCancelTarget(null)} onConfirm={cancelItem} />
    </>;
  }

  if (!data.openShift) {
    return (
      <div>
        <div className="mx-auto mt-10 max-w-xl space-y-6 rounded-3xl border bg-card p-7 shadow-lg">
          <div className="text-center">
            <Store className="mx-auto h-12 w-12 text-orange-500" />
            <h1 className="mt-3 text-2xl font-black">餐飲 POS 開班</h1>
            <p className="mt-2 text-sm text-muted-foreground">確認收銀台與開店零用金後，才可開桌與點餐。</p>
          </div>
          <div className="flex items-center justify-between rounded-xl bg-muted/40 px-4 py-3 text-sm"><span className="text-muted-foreground">開班人員</span><strong>{activeSession?.user?.name || "目前登入帳號"}</strong></div>
          <label className="block text-sm font-medium">
            收銀台
            <select value={registerId} onChange={(event) => setRegisterId(event.target.value)} className="mt-1 h-11 w-full rounded-lg border bg-background px-3">
              {data.registers.map((register) => <option key={register.id} value={register.id}>{register.code}・{register.name}</option>)}
            </select>
          </label>
          <label className="block text-sm font-medium">
            開班庫存現金（由零用金轉入）
            <input value={openingCash} onChange={(event) => setOpeningCash(event.target.value)} inputMode="decimal" disabled={!canManageOpeningCash} className="mt-1 h-11 w-full rounded-lg border bg-background px-3 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground" />
            <span className="mt-2 block text-xs leading-5 text-muted-foreground">{canManageOpeningCash ? "可輸入或修改；大於 0 時自動過帳：借記庫存現金、貸記零用金。開班後若需調整，請使用錢櫃投入／提出。" : "需要現金管理／核准權限才能輸入或修改；目前將以 0 元開班。"}</span>
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
          <p className="mt-1 text-sm text-slate-300">{data.openShift.register.name}・開班人員 {data.openShift.openedBy.name}・一個畫面完成開桌、加點、送廚與結帳</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {allowTableManagement && <button onClick={() => setTableManagerOpen(true)} className="inline-flex h-10 items-center gap-2 rounded-lg border border-orange-200 bg-orange-50 px-3 text-sm font-bold text-orange-800 dark:border-orange-900 dark:bg-orange-950/30 dark:text-orange-200"><Settings2 className="h-4 w-4" />桌位設定</button>}
          <Link href="/pos/restaurant/kitchen" className="inline-flex h-10 items-center gap-2 rounded-lg bg-white px-4 text-sm font-bold text-slate-950"><ChefHat className="h-4 w-4" />廚房看板</Link>
          <button onClick={() => setCashPanelOpen(true)} className="inline-flex h-10 items-center gap-2 rounded-lg border border-white/20 px-3 text-sm text-white"><CircleDollarSign className="h-4 w-4" />錢櫃異動{data.cashMovements.some((movement) => movement.status === "PENDING") ? `（${data.cashMovements.filter((movement) => movement.status === "PENDING").length} 待核）` : ""}</button>
          <button onClick={() => void previewCloseShift()} disabled={busy} className="inline-flex h-10 items-center gap-2 rounded-lg border border-white/20 px-3 text-sm text-white disabled:opacity-50"><ReceiptText className="h-4 w-4" />預覽結班</button>
          <button onClick={() => void load()} className="inline-flex h-10 items-center gap-2 rounded-lg border border-white/20 px-3 text-sm text-white"><RefreshCw className="h-4 w-4" />重新整理</button>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <div className="rounded-xl border bg-card p-4"><div className="text-xs font-bold text-muted-foreground">今日淨營業額</div><div className="mt-2 text-xl font-black">{money(daily.amount)}</div><div className="mt-1 text-[11px] text-muted-foreground">退款 {money(daily.refundAmount)}</div></div>
        <div className="rounded-xl border bg-card p-4"><div className="text-xs font-bold text-muted-foreground">今日淨售出份數</div><div className="mt-2 text-xl font-black">{daily.netQuantity}</div><div className="mt-1 text-[11px] text-muted-foreground">售出 {daily.soldQuantity}／退回 {daily.refundedQuantity}</div></div>
        <div className="rounded-xl border bg-card p-4"><div className="text-xs font-bold text-muted-foreground">今日結帳筆數</div><div className="mt-2 text-xl font-black">{daily.sales}</div><div className="mt-1 text-[11px] text-muted-foreground">退款 {daily.refunds} 筆</div></div>
        <div className="rounded-xl border bg-card p-4"><div className="text-xs font-bold text-muted-foreground">開店零用金</div><div className="mt-2 text-xl font-black">{money(data.shiftCash?.openingCash ?? data.openShift.openingCash)}</div><div className="mt-1 text-[11px] text-emerald-700">已納入會計傳票</div></div>
        <div className="rounded-xl border bg-card p-4"><div className="text-xs font-bold text-muted-foreground">目前應有現金</div><div className="mt-2 text-xl font-black">{money(data.shiftCash?.expectedCash ?? data.openShift.openingCash)}</div><div className="mt-1 text-[11px] text-muted-foreground">含現金銷售與已核准異動</div></div>
        <div className="rounded-xl border bg-card p-4"><div className="text-xs font-bold text-muted-foreground">總帳庫存現金</div><div className="mt-2 text-xl font-black">{money(data.ledgerCashBalance)}</div><div className="mt-1 text-[11px] text-muted-foreground">所有已過帳庫存現金餘額</div></div>
      </section>

      {allowTableManagement && <TableManager open={tableManagerOpen} onOpenChange={setTableManagerOpen} areas={data.tableSettings ?? []} busy={busy} onAction={action} />}

      <Dialog open={cashPanelOpen} onOpenChange={(open) => { if (!busy) setCashPanelOpen(open); }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><CircleDollarSign className="h-5 w-5" />錢櫃投入／提出／抽離</DialogTitle><DialogDescription>輸入金額與原因後送出申請；主管核准後才計入目前應有現金及結班差額。</DialogDescription></DialogHeader>
          <div className="space-y-5">
            <div className="grid gap-3 rounded-xl border bg-muted/30 p-4 md:grid-cols-[180px_160px_1fr_auto]">
              <select value={cashMovementType} onChange={(event) => setCashMovementType(event.target.value as "PAID_IN" | "PAID_OUT" | "SAFE_DROP")} className="h-10 rounded-lg border bg-background px-3 text-sm"><option value="PAID_IN">投入現金</option><option value="PAID_OUT">提出現金</option><option value="SAFE_DROP">營業中抽離／入庫</option></select>
              <input value={cashMovementAmount} onChange={(event) => setCashMovementAmount(event.target.value)} inputMode="decimal" placeholder="金額" className="h-10 rounded-lg border bg-background px-3 text-right" />
              <input value={cashMovementReason} onChange={(event) => setCashMovementReason(event.target.value)} placeholder="原因，例如：補充零錢、支付臨時運費" className="h-10 min-w-0 rounded-lg border bg-background px-3" />
              <button onClick={() => void requestCashMovement()} disabled={busy} className="h-10 rounded-lg bg-orange-600 px-4 font-semibold text-white disabled:opacity-40">送出申請</button>
            </div>
            <div className="max-h-[45vh] overflow-auto rounded-xl border">
              <table className="w-full min-w-[760px] text-sm"><thead className="sticky top-0 bg-muted"><tr><th className="p-3 text-left">時間</th><th className="p-3 text-left">類型</th><th className="p-3 text-right">金額</th><th className="p-3 text-left">原因</th><th className="p-3 text-left">狀態</th><th className="p-3 text-right">主管操作</th></tr></thead><tbody>
                {data.cashMovements.map((movement) => <tr key={movement.id} className="border-t"><td className="p-3">{new Date(movement.requestedAt).toLocaleString("zh-TW")}</td><td className="p-3">{CASH_MOVEMENT_LABELS[movement.type]}</td><td className="p-3 text-right font-semibold">{money(Number(movement.amount))}</td><td className="p-3">{movement.reason}</td><td className="p-3">{OPERATION_STATUS_LABELS[movement.status] || movement.status}</td><td className="p-3 text-right">{movement.status === "PENDING" && canManageOpeningCash ? <div className="inline-flex gap-2"><button onClick={() => void decideCashMovement(movement.id, "REJECT")} disabled={busy} className="h-8 rounded-lg border px-3">拒絕</button><button onClick={() => void decideCashMovement(movement.id, "APPROVE")} disabled={busy} className="inline-flex h-8 items-center gap-1 rounded-lg bg-emerald-600 px-3 text-white"><ShieldCheck className="h-4 w-4" />核准</button></div> : <span className="text-xs text-muted-foreground">{movement.status === "PENDING" ? "等待主管" : "—"}</span>}</td></tr>)}
                {data.cashMovements.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">本班次尚無錢櫃異動</td></tr>}
              </tbody></table>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={closePreview !== null} onOpenChange={(open) => { if (!open && !busy) setClosePreview(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>餐飲 POS 結班</DialogTitle><DialogDescription>確認本班銷售與錢櫃，結班後開店零用金會轉回零用金科目。</DialogDescription></DialogHeader>
          {closePreview && <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 rounded-xl border p-4 text-sm"><div><div className="text-muted-foreground">開班人員</div><div className="mt-1 font-bold">{closePreview.openedBy.name}</div></div><div><div className="text-muted-foreground">結班人員</div><div className="mt-1 font-bold">{closePreview.closingBy.name}</div></div></div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl bg-orange-50 p-3"><div className="text-orange-700">本班淨銷售</div><div className="mt-1 font-black text-orange-900">{money(closePreview.netSales)}</div></div>
              <div className="rounded-xl bg-emerald-50 p-3"><div className="text-emerald-700">應有現金</div><div className="mt-1 font-black text-emerald-900">{money(closePreview.expectedCash)}</div></div>
            </div>
            <label className="block text-sm font-bold">實點現金<input autoFocus value={closingCash} onChange={(event) => setClosingCash(event.target.value)} inputMode="decimal" className="mt-2 h-12 w-full rounded-xl border bg-background px-3 text-right text-xl font-black" /></label>
            <div className="flex items-center justify-between rounded-xl border p-4"><span className="text-sm text-muted-foreground">預計現金差額</span><strong className={closingCash !== "" && Number(closingCash) === closePreview.expectedCash ? "text-emerald-700" : "text-rose-700"}>{closingCash === "" ? "—" : money(Number(closingCash) - closePreview.expectedCash)}</strong></div>
            <button disabled={busy || closingCash === ""} onClick={() => void closeShift()} className="h-12 w-full rounded-xl bg-orange-600 font-bold text-white disabled:opacity-40">確認結班並轉回零用金</button>
          </div>}
        </DialogContent>
      </Dialog>

      <Dialog open={paymentDialog !== null} onOpenChange={(open) => { if (!open && !busy) setPaymentDialog(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{paymentDialog === "CASH" ? "現金收款" : "刷卡確認"}</DialogTitle><DialogDescription>桌單金額 {money(orderTotal)}。收款完成後前台立即結帳，ERP 與帳務在背景同步。</DialogDescription></DialogHeader>
          {paymentDialog === "CASH" ? <div className="space-y-4">
            <label className="block text-sm font-bold">實收現金<input autoFocus value={cashReceived} onChange={(event) => setCashReceived(event.target.value)} inputMode="decimal" placeholder="請輸入客人交付金額" className="mt-2 h-12 w-full rounded-xl border bg-background px-3 text-right text-xl font-black" /></label>
            <div className="grid grid-cols-4 gap-2">{[orderTotal, Math.ceil(orderTotal / 100) * 100, Math.ceil(orderTotal / 500) * 500, Math.ceil(orderTotal / 1000) * 1000].filter((value, index, values) => values.indexOf(value) === index).map((value) => <button key={value} onClick={() => setCashReceived(String(value))} className="h-9 rounded-lg border text-xs">{value === orderTotal ? "剛好" : money(value)}</button>)}</div>
            <div className="flex items-center justify-between rounded-xl bg-emerald-50 p-4"><span className="text-sm text-emerald-800">找零</span><strong className="text-2xl text-emerald-800">{money(Math.max(0, Number(cashReceived || 0) - orderTotal))}</strong></div>
            <button disabled={busy || Number(cashReceived || 0) < orderTotal} onClick={() => void checkout("CASH", Number(cashReceived || 0))} className="h-12 w-full rounded-xl bg-emerald-600 font-bold text-white disabled:opacity-40">確認收現並完成結帳</button>
          </div> : paymentDialog === "CARD" ? <div className="space-y-4">
            <ol className="list-decimal space-y-2 rounded-xl bg-indigo-50 p-4 pl-8 text-sm text-indigo-900"><li>在刷卡機感應、插卡或刷卡</li><li>等待刷卡機顯示交易成功</li><li>輸入授權碼或卡號末四碼</li></ol>
            <input autoFocus value={cardReference} onChange={(event) => setCardReference(event.target.value.toUpperCase())} placeholder="授權碼／卡號末四碼" className="h-11 w-full rounded-xl border bg-background px-3 font-mono uppercase" />
            <label className="flex items-start gap-3 rounded-xl border p-3 text-sm"><input type="checkbox" checked={cardApproved} onChange={(event) => setCardApproved(event.target.checked)} className="mt-1" /><span><strong>刷卡機已顯示核准</strong><span className="mt-1 block text-xs text-muted-foreground">未核准不可完成 POS 結帳，避免刷卡失敗卻誤記收款。</span></span></label>
            <button disabled={busy || !cardApproved || cardReference.trim().length < 4} onClick={() => void checkout("CARD", orderTotal, cardReference)} className="h-12 w-full rounded-xl bg-indigo-600 font-bold text-white disabled:opacity-40">確認刷卡核准並完成結帳</button>
          </div> : null}
        </DialogContent>
      </Dialog>

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
                    <button disabled={item.status !== "PENDING" || busy} onClick={() => Number(item.quantity) <= 1 ? requestCancelItem(item) : void updateItem(item, Number(item.quantity) - 1)} className="h-7 w-7 rounded border disabled:opacity-30"><Minus className="mx-auto h-3 w-3" /></button>
                    <span className="w-8 text-center text-sm font-bold">{Number(item.quantity)}</span>
                    <button disabled={item.status !== "PENDING" || busy} onClick={() => void updateItem(item, Number(item.quantity) + 1)} className="h-7 w-7 rounded border disabled:opacity-30"><Plus className="mx-auto h-3 w-3" /></button>
                    {item.status !== "CANCELLED" && ((["PENDING", "SENT"].includes(item.status) && canCancelUnprepared) || (!["PENDING", "SENT"].includes(item.status) && canCancelWaste)) && <button disabled={busy} onClick={() => requestCancelItem(item)} title="取消餐點並保留原因" className="ml-auto h-8 rounded-lg border border-rose-200 px-2 text-xs font-bold text-rose-700 hover:bg-rose-50"><Trash2 className="mr-1 inline h-3 w-3" />取消</button>}
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
                  <button disabled={busy || orderTotal <= 0} onClick={() => openPaymentDialog("CASH")} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 font-bold text-white"><Banknote className="h-4 w-4" />現金結帳</button>
                  <button disabled={busy || orderTotal <= 0} onClick={() => openPaymentDialog("CARD")} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-indigo-600 font-bold text-white"><CreditCard className="h-4 w-4" />刷卡結帳</button>
                </div>
                {lastPayment && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900"><div className="flex items-center gap-2 font-bold"><CheckCircle2 className="h-4 w-4" />{lastPayment.number} 收款完成</div><div className="mt-1">{lastPayment.method === "CASH" ? `實收 ${money(lastPayment.paidAmount)}・找零 ${money(lastPayment.changeDue)}` : `刷卡核准 ${lastPayment.reference}`}</div><div className="mt-1">進銷存、庫存流水與會計傳票背景同步中</div></div>}
                {lastSaleId && <button onClick={() => window.open(`/print/pos/${lastSaleId}?print=1`, "_blank", "noopener,noreferrer")} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border text-sm"><ReceiptText className="h-4 w-4" />列印收據</button>}
              </div>
            </div>
          )}
        </section>
      </div>
      <RestaurantRefundHistory shift={data.openShift} canRefund={canRefundTransactions} onRefunded={load} />
      <CancelRestaurantItemDialog item={cancelTarget} busy={busy} canWaste={canCancelWaste} onClose={() => setCancelTarget(null)} onConfirm={cancelItem} />
    </div>
  );
}

function CancelRestaurantItemDialog({ item, busy, canWaste, onClose, onConfirm }: {
  item: OrderItem | null;
  busy: boolean;
  canWaste: boolean;
  onClose: () => void;
  onConfirm: (reason: string, disposition: "NOT_PREPARED" | "WASTE") => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [disposition, setDisposition] = useState<"NOT_PREPARED" | "WASTE">("NOT_PREPARED");
  const mustWaste = Boolean(item && !["PENDING", "SENT"].includes(item.status));

  useEffect(() => {
    setReason("");
    setDisposition(item && !["PENDING", "SENT"].includes(item.status) ? "WASTE" : "NOT_PREPARED");
  }, [item]);

  return <Dialog open={Boolean(item)} onOpenChange={(open) => !open && !busy && onClose()}>
    <DialogContent className="max-w-lg">
      <DialogHeader><DialogTitle>取消餐點</DialogTitle><DialogDescription>取消後不刪除資料，會保留原因、操作者、時間與庫存／會計異動。</DialogDescription></DialogHeader>
      {item && <div className="space-y-4">
        <div className="rounded-xl border bg-muted/40 p-4"><div className="font-black">{Number(item.quantity)} × {item.product.name}</div><div className="mt-1 text-xs text-muted-foreground">目前狀態：{item.status}</div></div>
        <label className="block text-sm font-medium">處理方式<select value={disposition} onChange={(event) => setDisposition(event.target.value as "NOT_PREPARED" | "WASTE")} disabled={mustWaste || busy} className="mt-1 h-10 w-full rounded-lg border bg-background px-3"><option value="NOT_PREPARED">尚未製作／不動庫存</option>{canWaste && <option value="WASTE">已製作報廢／扣庫存並入帳</option>}</select></label>
        {mustWaste && <div className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm font-semibold text-rose-900">此餐點已開始製作或已完成，只能登錄為報廢；系統會扣除庫存並建立耗用傳票。</div>}
        <label className="block text-sm font-medium">取消原因（必填）<textarea value={reason} onChange={(event) => setReason(event.target.value)} disabled={busy} placeholder="例如：客人改點、重複測試單、餐點製作錯誤" className="mt-1 min-h-24 w-full rounded-xl border bg-background p-3" /></label>
        <div className="flex justify-end gap-2"><button onClick={onClose} disabled={busy} className="h-10 rounded-lg border px-4">返回</button><button onClick={() => void onConfirm(reason.trim(), mustWaste ? "WASTE" : disposition)} disabled={busy || reason.trim().length < 2} className="inline-flex h-10 items-center gap-2 rounded-lg bg-rose-600 px-4 font-bold text-white disabled:opacity-40">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}確認取消</button></div>
      </div>}
    </DialogContent>
  </Dialog>;
}

type RecentRestaurantSale = {
  id: string;
  number: string;
  total: number | string;
  status: string;
  createdAt: string;
  refundedTotal?: number;
  refundableQuantity?: number;
  register?: { name: string };
  customer?: { companyName: string } | null;
  restaurantOrder?: { number: string; table: { name: string } } | null;
};

function RestaurantRefundHistory({ shift, canRefund, onRefunded }: {
  shift: Bootstrap["openShift"];
  canRefund: boolean;
  onRefunded: () => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [sales, setSales] = useState<RecentRestaurantSale[]>([]);
  const [refundSale, setRefundSale] = useState<any>(null);
  const [refundQty, setRefundQty] = useState<Record<string, number | string>>({});
  const [dispositions, setDispositions] = useState<Record<string, "SELLABLE" | "DAMAGED" | "SCRAP">>({});
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const loadSales = useCallback(async () => {
    const params = new URLSearchParams({ channel: "restaurant" });
    if (query.trim()) params.set("q", query.trim());
    const response = await fetch(`/api/pos/sales?${params}`, { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "餐飲交易查詢失敗");
    setSales(result.items ?? []);
  }, [query]);

  useEffect(() => { void loadSales().catch((error) => toast.error(error.message)); }, [loadSales]);

  const estimate = useMemo(() => {
    if (!refundSale) return 0;
    return Math.round((refundSale.items ?? []).reduce((sum: number, item: any) => {
      const quantity = Number(refundQty[item.id] ?? 0);
      return sum + Number(item.subtotal) * quantity / Math.max(Number(item.quantity), 0.0001);
    }, 0) * 100) / 100;
  }, [refundQty, refundSale]);

  async function openRefund(saleId: string) {
    if (!shift) return toast.error("請先開班才能退款");
    if (!canRefund) return toast.error("需要 POS 新增與退貨新增權限才能退款");
    setBusy(true);
    try {
      const response = await fetch(`/api/pos/sales/${saleId}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "原交易載入失敗");
      setRefundSale(result);
      setRefundQty(Object.fromEntries((result.items ?? []).map((item: any) => [item.id, 0])));
      setDispositions(Object.fromEntries((result.items ?? []).map((item: any) => [item.id, "SCRAP"])));
      setReason("");
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function submitRefund() {
    if (!shift || !refundSale) return;
    const items = refundSale.items.map((item: any) => ({ saleItemId: item.id, quantity: Number(refundQty[item.id] ?? 0), disposition: dispositions[item.id] || "SCRAP" })).filter((item: any) => Number.isFinite(item.quantity) && item.quantity > 0);
    if (!items.length) return toast.error("請至少輸入一筆退款數量");
    if (reason.trim().length < 2) return toast.error("請輸入至少 2 個字的退款原因");
    setBusy(true);
    try {
      const response = await fetch("/api/pos/refunds", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ shiftId: shift.id, saleId: refundSale.id, returnWarehouseId: shift.register.warehouseId, reason: reason.trim(), items }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "退款失敗");
      toast.success(result.message || "退款完成");
      setRefundSale(null);
      await Promise.all([loadSales(), onRefunded()]);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  }

  return <section id="restaurant-refunds" className="overflow-hidden rounded-2xl border bg-card shadow-sm">
    <div className="flex flex-col justify-between gap-3 border-b p-4 md:flex-row md:items-center"><div><div className="flex items-center gap-2 font-bold"><ReceiptText className="h-5 w-5" />餐飲歷史交易與退款</div><div className="mt-1 text-xs text-muted-foreground">退款引用原結帳交易並保留歷次紀錄；餐點預設為報廢不回庫，可依實際品況改為良品回庫。</div></div><div className="flex gap-2"><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void loadSales(); }} placeholder="交易單號／桌單／客戶" className="h-10 min-w-0 rounded-lg border bg-background px-3 text-sm" /><button onClick={() => void loadSales()} className="h-10 rounded-lg border px-4 text-sm">查詢</button></div></div>
    <div className="overflow-x-auto"><table className="w-full min-w-[780px] text-sm"><thead className="bg-muted/50 text-xs"><tr><th className="p-3 text-left">交易／桌位</th><th className="p-3 text-left">時間</th><th className="p-3 text-right">原金額</th><th className="p-3 text-right">已退款</th><th className="p-3 text-left">狀態</th><th className="p-3 text-right">操作</th></tr></thead><tbody>{sales.map((sale) => {
      const refundable = ["COMPLETED", "PARTIALLY_REFUNDED"].includes(sale.status) && Number(sale.refundableQuantity ?? 0) > 0;
      return <tr key={sale.id} className="border-t"><td className="p-3"><div className="font-mono text-xs">{sale.number}</div><div className="text-xs text-muted-foreground">{sale.restaurantOrder?.table.name || "餐飲外帶"}・{sale.restaurantOrder?.number}</div></td><td className="p-3">{new Date(sale.createdAt).toLocaleString("zh-TW")}</td><td className="p-3 text-right">{money(Number(sale.total))}</td><td className="p-3 text-right text-rose-700">{money(Number(sale.refundedTotal ?? 0))}</td><td className="p-3">{sale.status === "COMPLETED" ? "已完成" : sale.status === "PARTIALLY_REFUNDED" ? "部分退款" : sale.status === "REFUNDED" ? "已全退" : sale.status}</td><td className="p-3 text-right"><button disabled={!refundable || busy || !canRefund} onClick={() => void openRefund(sale.id)} title={canRefund ? "依原交易退款" : "需要 POS 新增與退貨新增權限"} className="inline-flex h-9 items-center gap-1 rounded-lg border px-3 disabled:opacity-40"><RotateCcw className="h-4 w-4" />退款</button></td></tr>;
    })}{sales.length === 0 && <tr><td colSpan={6} className="p-10 text-center text-muted-foreground">目前沒有餐飲結帳交易</td></tr>}</tbody></table></div>

    {refundSale && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-background shadow-2xl"><div className="flex items-start justify-between border-b p-5"><div><div className="text-lg font-bold">餐飲原交易退款・{refundSale.number}</div><div className="mt-1 text-xs text-muted-foreground">退款後會依原付款方式沖現金／銀行並建立銷貨退回傳票</div></div><button onClick={() => setRefundSale(null)} disabled={busy} aria-label="關閉"><X className="h-5 w-5" /></button></div><div className="space-y-4 p-5"><div className="overflow-x-auto rounded-xl border"><table className="w-full min-w-[820px] text-sm"><thead className="bg-muted/50 text-xs"><tr><th className="p-3 text-left">餐點</th><th className="p-3 text-right">原數量</th><th className="p-3 text-right">已退</th><th className="p-3 text-right">可退</th><th className="p-3 text-right">本次</th><th className="p-3 text-left">品況</th></tr></thead><tbody>{refundSale.items.map((item: any) => {
      const remaining = Math.max(0, Math.round((Number(item.quantity) - Number(item.returnedQty)) * 10_000) / 10_000);
      return <tr key={item.id} className="border-t"><td className="p-3"><div className="font-medium">{item.product?.name}</div><div className="font-mono text-xs text-muted-foreground">{item.product?.sku}</div></td><td className="p-3 text-right">{Number(item.quantity)}</td><td className="p-3 text-right">{Number(item.returnedQty)}</td><td className="p-3 text-right font-semibold">{remaining}</td><td className="p-3"><input type="number" min="0" max={remaining} step="0.0001" value={refundQty[item.id] ?? 0} onChange={(event) => setRefundQty((current) => ({ ...current, [item.id]: event.target.value }))} disabled={busy || remaining <= 0} className="ml-auto block h-9 w-28 rounded-lg border px-2 text-right" /></td><td className="p-3"><select value={dispositions[item.id] || "SCRAP"} onChange={(event) => setDispositions((current) => ({ ...current, [item.id]: event.target.value as any }))} disabled={busy || remaining <= 0} className="h-9 rounded-lg border bg-background px-2"><option value="SCRAP">已製作報廢／不回庫</option><option value="DAMAGED">瑕疵／不回庫</option><option value="SELLABLE">未拆良品／回可售庫存</option></select></td></tr>;
    })}</tbody></table></div><label className="block text-sm font-medium">退款原因（必填）<textarea value={reason} onChange={(event) => setReason(event.target.value)} disabled={busy} placeholder="例如：餐點錯誤、客戶退餐" className="mt-1 min-h-20 w-full rounded-xl border p-3" /></label><div className="flex items-center justify-between border-t pt-4"><div><div className="text-xs text-muted-foreground">本次預估退款</div><div className="text-2xl font-black text-rose-700">{money(estimate)}</div></div><div className="flex gap-2"><button onClick={() => setRefundSale(null)} disabled={busy} className="h-11 rounded-xl border px-5">取消</button><button onClick={() => void submitRefund()} disabled={busy || estimate <= 0} className="inline-flex h-11 items-center gap-2 rounded-xl bg-rose-600 px-5 font-bold text-white disabled:opacity-40">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}確認退款</button></div></div></div></div></div>}
  </section>;
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

function KitchenBoard({ tickets, busy, history, canCancelUnprepared, canCancelWaste, refresh, setHistory, cancel, update }: {
  tickets: KitchenTicket[];
  busy: boolean;
  history: boolean;
  canCancelUnprepared: boolean;
  canCancelWaste: boolean;
  refresh: () => Promise<void>;
  setHistory: (value: boolean) => void;
  cancel: (item: OrderItem) => void;
  update: (itemId: string, status: "PREPARING" | "READY" | "SERVED") => Promise<any>;
}) {
  const [pendingItemId, setPendingItemId] = useState("");
  const [optimisticStatuses, setOptimisticStatuses] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<{ tone: "progress" | "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    setOptimisticStatuses((current) => {
      const next = { ...current };
      for (const ticket of tickets) {
        for (const { orderItem } of ticket.items) {
          if (next[orderItem.id] === orderItem.status) delete next[orderItem.id];
        }
      }
      return next;
    });
  }, [tickets]);

  const statusLabel = (status: string) => status === "SENT" ? "等待製作" : status === "PREPARING" ? "製作中" : status === "READY" ? "完成待出" : status === "SERVED" ? "已出餐" : status === "CANCELLED" ? "已取消" : status;
  const clock = (value: string | null | undefined) => value ? new Date(value).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Asia/Taipei" }) : "—";
  const duration = (from: string | null | undefined, to: string | null | undefined) => {
    if (!from) return "—";
    const seconds = Math.max(0, Math.round(((to ? new Date(to) : new Date()).getTime() - new Date(from).getTime()) / 1000));
    const minutes = Math.floor(seconds / 60);
    return minutes > 0 ? `${minutes} 分 ${seconds % 60} 秒` : `${seconds} 秒`;
  };

  async function changeStatus(ticket: KitchenTicket, orderItem: OrderItem, status: "PREPARING" | "READY" | "SERVED") {
    const actionLabel = status === "PREPARING" ? "開始製作" : status === "READY" ? "完成待出" : "確認出餐";
    setPendingItemId(orderItem.id);
    setOptimisticStatuses((current) => ({ ...current, [orderItem.id]: status }));
    setFeedback({ tone: "progress", text: `${ticket.order.table.name}・${orderItem.product.name}：${actionLabel}處理中…` });
    const result = await update(orderItem.id, status);
    if (result) {
      setFeedback({ tone: "success", text: `✓ ${ticket.order.table.name}・${orderItem.product.name}：${statusLabel(status)}，時間 ${clock(result.changedAt ?? new Date().toISOString())}` });
    } else {
      setOptimisticStatuses((current) => {
        const next = { ...current };
        delete next[orderItem.id];
        return next;
      });
      setFeedback({ tone: "error", text: `✕ ${ticket.order.table.name}・${orderItem.product.name}：狀態更新失敗，請再試一次` });
    }
    setPendingItemId("");
  }

  return <div className="space-y-4">
    <header className="flex flex-col justify-between gap-3 rounded-2xl bg-slate-950 p-5 text-white md:flex-row md:items-center">
      <div><h1 className="flex items-center gap-2 text-2xl font-black"><ChefHat className="h-6 w-6 text-orange-400" />廚房出餐看板</h1><p className="mt-1 text-xs text-slate-400">每 10 秒自動更新；進行中只顯示待製作、製作中與待出餐，已出餐／已取消移到今日歷史。</p></div>
      <div className="flex flex-wrap gap-2"><button onClick={() => setHistory(false)} className={`h-10 rounded-lg px-4 text-sm font-bold ${!history ? "bg-orange-500 text-white" : "border border-white/20 text-white"}`}>進行中</button><button onClick={() => setHistory(true)} className={`h-10 rounded-lg px-4 text-sm font-bold ${history ? "bg-indigo-500 text-white" : "border border-white/20 text-white"}`}>今日歷史</button><Link href="/pos/restaurant" className="h-10 rounded-lg border border-white/20 px-4 py-2 text-sm">回點餐</Link><button onClick={() => void refresh()} className="inline-flex h-10 items-center gap-2 rounded-lg bg-white px-4 text-sm font-bold text-slate-950"><RefreshCw className="h-4 w-4" />更新</button></div>
    </header>

    {feedback && <div role="status" aria-live="polite" className={`rounded-2xl border-2 p-4 text-base font-black shadow-sm ${feedback.tone === "success" ? "border-emerald-400 bg-emerald-50 text-emerald-900" : feedback.tone === "error" ? "border-rose-400 bg-rose-50 text-rose-900" : "animate-pulse border-orange-400 bg-orange-50 text-orange-900"}`}>{feedback.text}</div>}

    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {tickets.map((ticket) => <article key={ticket.id} className={`rounded-2xl border-2 p-4 shadow-md transition-all ${ticket.status === "SERVED" ? "border-indigo-400 bg-indigo-50/70" : ticket.status === "READY" ? "border-emerald-500 bg-emerald-50/60 ring-2 ring-emerald-200" : ticket.status === "PREPARING" ? "border-orange-500 bg-orange-50/60" : "border-slate-300 bg-card"}`}>
        <div className="flex justify-between gap-3"><div><div className="text-xl font-black">{ticket.order.table.name}</div><div className="text-xs text-muted-foreground">{ticket.number}</div></div><div className="flex items-start gap-2"><button onClick={() => window.open(`/print/kitchen/${ticket.id}`, "_blank", "noopener,noreferrer")} title="列印廚房單" className="rounded-lg border bg-white p-2"><Printer className="h-4 w-4" /></button><span className={`rounded-full px-3 py-1 text-xs font-black ${ticket.status === "SERVED" ? "bg-indigo-600 text-white" : ticket.status === "READY" ? "bg-emerald-600 text-white" : ticket.status === "PREPARING" ? "bg-orange-500 text-white" : "bg-slate-200 text-slate-800"}`}>{statusLabel(ticket.status)}</span></div></div>
        <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl border bg-white/80 p-3 text-xs">
          <div><span className="text-muted-foreground">送廚</span><strong className="ml-2">{clock(ticket.sentAt)}</strong></div>
          <div><span className="text-muted-foreground">開始</span><strong className="ml-2">{clock(ticket.startedAt)}</strong></div>
          <div><span className="text-muted-foreground">完成</span><strong className="ml-2">{clock(ticket.readyAt)}</strong></div>
          <div><span className="text-muted-foreground">出餐</span><strong className="ml-2">{clock(ticket.servedAt)}</strong></div>
          <div className="col-span-2 border-t pt-2"><span className="text-muted-foreground">目前總耗時</span><strong className="ml-2 text-sm">{duration(ticket.sentAt, ticket.servedAt)}</strong>{ticket.startedAt && ticket.readyAt && <span className="ml-3 text-muted-foreground">製作 {duration(ticket.startedAt, ticket.readyAt)}</span>}</div>
        </div>
        <div className="mt-4 space-y-3">{ticket.items.map(({ orderItem }) => {
          const displayStatus = optimisticStatuses[orderItem.id] ?? orderItem.status;
          const processing = pendingItemId === orderItem.id;
          const itemTone = displayStatus === "CANCELLED" ? "border-rose-300 bg-rose-50" : displayStatus === "SERVED" ? "border-indigo-400 bg-indigo-100/70" : displayStatus === "READY" ? "border-emerald-500 bg-emerald-100/80 ring-2 ring-emerald-200" : displayStatus === "PREPARING" ? "border-orange-500 bg-orange-100/80" : "border-slate-200 bg-white";
          return <div key={orderItem.id} className={`rounded-xl border-2 p-3 transition-all ${itemTone} ${processing ? "animate-pulse" : ""}`}>
            <div className="flex justify-between gap-2"><div className="text-base font-black">{Number(orderItem.quantity)} × {orderItem.product.name}</div><span className={`rounded-full px-2 py-1 text-xs font-black ${displayStatus === "CANCELLED" ? "bg-rose-600 text-white" : displayStatus === "SERVED" ? "bg-indigo-600 text-white" : displayStatus === "READY" ? "bg-emerald-600 text-white" : displayStatus === "PREPARING" ? "bg-orange-500 text-white" : "bg-slate-200 text-slate-800"}`}>{processing ? "更新中…" : statusLabel(displayStatus)}</span></div>
            {orderItem.note && <div className="mt-2 rounded-lg bg-rose-100 p-2 text-sm font-black text-rose-700">備註：{orderItem.note}</div>}
            {orderItem.cancelReason && <div className="mt-2 rounded-lg border border-rose-200 bg-white p-2 text-sm text-rose-800">取消原因：{orderItem.cancelReason}・{orderItem.cancelDisposition === "WASTE" ? "已登錄報廢" : "未製作取消"}</div>}
            <div className="mt-3 flex gap-2">
              {!history && orderItem.status === "SENT" && <button disabled={busy || processing} onClick={() => void changeStatus(ticket, orderItem, "PREPARING")} className="h-12 flex-1 rounded-xl bg-orange-500 px-3 text-sm font-black text-white shadow-lg shadow-orange-200 disabled:opacity-50">{processing ? "處理中…" : "▶ 開始製作"}</button>}
              {!history && ["SENT", "PREPARING"].includes(orderItem.status) && <button disabled={busy || processing} onClick={() => void changeStatus(ticket, orderItem, "READY")} className="h-12 flex-1 rounded-xl bg-emerald-600 px-3 text-sm font-black text-white shadow-lg shadow-emerald-200 disabled:opacity-50">{processing ? "處理中…" : "✓ 完成待出"}</button>}
              {!history && orderItem.status === "READY" && <button disabled={busy || processing} onClick={() => void changeStatus(ticket, orderItem, "SERVED")} className="h-12 flex-1 rounded-xl bg-indigo-600 px-3 text-sm font-black text-white shadow-lg shadow-indigo-200 disabled:opacity-50">{processing ? "處理中…" : "↗ 確認已出餐"}</button>}
              {!history && ((orderItem.status === "SENT" && canCancelUnprepared) || (["PREPARING", "READY"].includes(orderItem.status) && canCancelWaste)) && <button disabled={busy || processing} onClick={() => cancel(orderItem)} className="h-12 rounded-xl border-2 border-rose-300 bg-white px-3 text-sm font-black text-rose-700 disabled:opacity-50"><Trash2 className="mr-1 inline h-4 w-4" />取消</button>}
              {orderItem.status === "SERVED" && <div className="flex h-12 flex-1 items-center justify-center rounded-xl border-2 border-indigo-400 bg-indigo-100 text-sm font-black text-indigo-900">✓ 已出餐完成</div>}
              {orderItem.status === "CANCELLED" && <div className="flex h-12 flex-1 items-center justify-center rounded-xl border-2 border-rose-300 bg-rose-100 text-sm font-black text-rose-900">✕ 已取消並封存</div>}
            </div>
          </div>;
        })}</div>
      </article>)}
      {tickets.length === 0 && <div className="col-span-full rounded-2xl border border-dashed p-16 text-center text-muted-foreground"><ChefHat className="mx-auto h-12 w-12 opacity-30" /><div className="mt-3 font-bold">{history ? "今日尚無已完成或已取消餐點" : "目前沒有待製作餐點"}</div></div>}
    </div>
  </div>;
}