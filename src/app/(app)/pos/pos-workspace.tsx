"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { AlertTriangle, Archive, ArchiveRestore, Banknote, Barcode, CheckCircle2, CircleDollarSign, CreditCard, Loader2, Minus, Percent, Plus, Printer, ReceiptText, RefreshCw, RotateCcw, Search, ShieldCheck, ShoppingCart, Store, UserRound, WalletCards, X } from "lucide-react";
import { toast } from "sonner";
import { formatTwd } from "@/lib/plans";
import { hasPermission } from "@/lib/auth";
import { choosePosRecoveryDraft, clearLocalPosDraft, readLocalPosDraft, writeLocalPosDraft } from "@/lib/pos-recovery";

type Register = { id: string; code: string; name: string; warehouse: { id: string; code: string; name: string } };
type Warehouse = { id: string; code: string; name: string };
type Shift = { id: string; register: { id: string; code: string; name: string; warehouseId: string }; openingCash: number; openedAt: string };
type Product = { id: string; sku: string; barcode?: string | null; name: string; spec?: string | null; salePrice: number | string; stockTotal: number; imageUrl?: string | null };
type CartItem = { product: Product; quantity: number; discount: number };
type Customer = { id: string; code: string; companyName: string; phone?: string | null; taxId?: string | null };
type PaymentMethod = "CASH" | "CARD" | "MOBILE" | "TRANSFER";
type PaymentLine = { method: PaymentMethod; amount: string; reference: string };
type InvoiceMode = "NONE" | "PAPER" | "MOBILE_CARRIER" | "CITIZEN_CERT" | "DONATION" | "BUSINESS";
type Offer = { id: string; code: string; name: string; kind: "PERCENT" | "AMOUNT"; value: number | string; minSpend: number | string; maxDiscount?: number | string | null; priority?: number };
type CashMovement = { id: string; type: "PAID_IN" | "PAID_OUT" | "SAFE_DROP"; status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED"; amount: number | string; reason: string; requestedById: string; approvedById?: string | null; requestedAt: string };
type HeldSale = { id: string; label: string; payload: any; createdAt: string };
type RecentSale = {
  id: string;
  number: string;
  total: number | string;
  status: string;
  createdAt: string;
  refundedTotal?: number;
  refundableQuantity?: number;
  register?: { name: string };
  customer?: { companyName: string } | null;
};
type ShiftSummary = {
  openingCash: number;
  expectedCash: number;
  closingCash: number | null;
  difference: number | null;
  grossSales: number;
  refunds: number;
  netSales: number;
  saleCount: number;
  refundCount: number;
  payments: Array<{ method: string; sales: number; refunds: number; net: number }>;
  cashMovements?: { paidIn: number; paidOut: number; safeDrop: number };
  pendingMovementCount?: number;
  heldSaleCount?: number;
  draftCount?: number;
};

const CASH_MOVEMENT_LABELS = { PAID_IN: "投入現金", PAID_OUT: "提出現金", SAFE_DROP: "營業中抽離／入庫" } as const;
const OPERATION_STATUS_LABELS: Record<string, string> = { PENDING: "待主管核准", APPROVED: "已核准", REJECTED: "已拒絕", CANCELLED: "已取消" };

export function PosWorkspace() {
  const { data: activeSession } = useSession();
  const canApproveCash = hasPermission(activeSession?.user?.permissions, "cash.approve");
  const canApproveDiscount = hasPermission(activeSession?.user?.permissions, "sales.approve");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [registers, setRegisters] = useState<Register[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [shift, setShift] = useState<Shift | null>(null);
  const [today, setToday] = useState({ sales: 0, refunds: 0, grossAmount: 0, refundAmount: 0, amount: 0 });
  const [recentSales, setRecentSales] = useState<RecentSale[]>([]);
  const [saleQuery, setSaleQuery] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [query, setQuery] = useState("");
  const scanInputRef = useRef<HTMLInputElement>(null);
  const checkoutRequestIdRef = useRef("");
  const customerDisplayChannelRef = useRef<BroadcastChannel | null>(null);
  const draftCheckedShiftRef = useRef("");
  const autosaveReadyRef = useRef(false);
  const draftRevisionRef = useRef(0);
  const draftSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const productRequestKeyRef = useRef("");
  const customerRequestKeyRef = useRef("");
  const offerRequestKeyRef = useRef("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerQuery, setCustomerQuery] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [selectedRegister, setSelectedRegister] = useState("");
  const [openingCash, setOpeningCash] = useState("0");
  const [closingCash, setClosingCash] = useState("");
  const [shiftPreview, setShiftPreview] = useState<ShiftSummary | null>(null);
  const [lastCloseSummary, setLastCloseSummary] = useState<ShiftSummary | null>(null);
  const [paymentLines, setPaymentLines] = useState<PaymentLine[]>([{ method: "CASH", amount: "", reference: "" }]);
  const [lastReceipt, setLastReceipt] = useState<{ id: string; number: string; total: number; changeDue: number; electronicInvoice?: { provider: string; status: string; invoiceNumber?: string | null; lastError?: string | null } | null } | null>(null);
  const [invoiceMode, setInvoiceMode] = useState<InvoiceMode>("NONE");
  const [invoiceBuyerTaxId, setInvoiceBuyerTaxId] = useState("");
  const [invoiceCarrierId, setInvoiceCarrierId] = useState("");
  const [invoiceDonationCode, setInvoiceDonationCode] = useState("");
  const [refundSale, setRefundSale] = useState<any>(null);
  const [refundQty, setRefundQty] = useState<Record<string, number | string>>({});
  const [refundDisposition, setRefundDisposition] = useState<Record<string, "SELLABLE" | "DAMAGED" | "SCRAP">>({});
  const [refundWarehouseId, setRefundWarehouseId] = useState("");
  const [refundAsExchange, setRefundAsExchange] = useState(false);
  const [pendingExchange, setPendingExchange] = useState<{ id: string; number: string } | null>(null);
  const [refundReason, setRefundReason] = useState("");
  const [refundBusy, setRefundBusy] = useState(false);
  const [cashMovements, setCashMovements] = useState<CashMovement[]>([]);
  const [cashPanelOpen, setCashPanelOpen] = useState(false);
  const [cashMovementType, setCashMovementType] = useState<"PAID_IN" | "PAID_OUT" | "SAFE_DROP">("PAID_IN");
  const [cashMovementAmount, setCashMovementAmount] = useState("");
  const [cashMovementReason, setCashMovementReason] = useState("");
  const [heldSales, setHeldSales] = useState<HeldSale[]>([]);
  const [holdPanelOpen, setHoldPanelOpen] = useState(false);
  const [holdLabel, setHoldLabel] = useState("");
  const [recoveryDraft, setRecoveryDraft] = useState<any>(null);
  const [draftProtection, setDraftProtection] = useState<"NONE" | "LOCAL" | "SERVER" | "CONFLICT">("NONE");
  const [operationBusy, setOperationBusy] = useState(false);
  const [promotions, setPromotions] = useState<Offer[]>([]);
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<Offer | null>(null);
  const [loyaltyPoints, setLoyaltyPoints] = useState(0);
  const [redeemPoints, setRedeemPoints] = useState(0);
  const [discountApproval, setDiscountApproval] = useState<any>(null);
  const [discountReason, setDiscountReason] = useState("");

  const loadBootstrap = useCallback(async () => {
    const res = await fetch("/api/pos/bootstrap", { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "POS 資料載入失敗");
    setRegisters(data.registers ?? []);
    setWarehouses(data.warehouses ?? []);
    setShift(data.openShift ?? null);
    setToday(data.today ?? { sales: 0, refunds: 0, grossAmount: 0, refundAmount: 0, amount: 0 });
    setRecentSales(data.recentSales ?? []);
    setSelectedRegister((value) => value || data.registers?.[0]?.id || "");
    return data.openShift as Shift | null;
  }, []);

  const loadProducts = useCallback(async (activeShift: Shift | null) => {
    if (!activeShift) {
      setProducts([]);
      productRequestKeyRef.current = "";
      return;
    }
    productRequestKeyRef.current = `${activeShift.id}:`;
    const params = new URLSearchParams({ warehouseId: activeShift.register.warehouseId });
    const res = await fetch(`/api/pos/products?${params}`, { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "商品載入失敗");
    setProducts(data.items ?? []);
  }, []);

  const loadCustomers = useCallback(async (value = "") => {
    customerRequestKeyRef.current = value.trim().toLowerCase();
    const params = new URLSearchParams();
    if (value.trim()) params.set("q", value.trim());
    const res = await fetch(`/api/pos/customers?${params}`, { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "會員資料載入失敗");
    setCustomers(data.items ?? []);
  }, []);

  const loadOffers = useCallback(async (customerId = "") => {
    offerRequestKeyRef.current = customerId;
    const params = new URLSearchParams();
    if (customerId) params.set("customerId", customerId);
    const res = await fetch(`/api/pos/offers?${params}`, { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "促銷與會員點數載入失敗");
    setPromotions(data.promotions ?? []);
    setLoyaltyPoints(Number(data.customer?.loyaltyPoints ?? 0));
    if (!customerId) setRedeemPoints(0);
  }, []);

  const loadOperations = useCallback(async (activeShift: Shift | null) => {
    if (!activeShift) {
      setCashMovements([]);
      setHeldSales([]);
      setRecoveryDraft(null);
      draftCheckedShiftRef.current = "";
      autosaveReadyRef.current = false;
      draftRevisionRef.current = 0;
      setDraftProtection("NONE");
      return;
    }
    const shouldLoadDraft = draftCheckedShiftRef.current !== activeShift.id;
    const [cashRes, holdRes, draftRes] = await Promise.all([
      fetch(`/api/pos/cash-movements?shiftId=${encodeURIComponent(activeShift.id)}`, { cache: "no-store" }),
      fetch(`/api/pos/holds?shiftId=${encodeURIComponent(activeShift.id)}`, { cache: "no-store" }),
      shouldLoadDraft
        ? fetch(`/api/pos/draft?shiftId=${encodeURIComponent(activeShift.id)}`, { cache: "no-store" })
        : Promise.resolve(null),
    ]);
    const [cashData, holdData] = await Promise.all([cashRes.json(), holdRes.json()]);
    if (!cashRes.ok) throw new Error(cashData.error || "錢櫃紀錄載入失敗");
    if (!holdRes.ok) throw new Error(holdData.error || "暫存單載入失敗");
    setCashMovements(cashData.items ?? []);
    setHeldSales(holdData.items ?? []);
    if (draftRes) {
      const draftData = await draftRes.json();
      if (!draftRes.ok) throw new Error(draftData.error || "停電復原草稿載入失敗");
      draftCheckedShiftRef.current = activeShift.id;
      const serverDraft = draftData.draft ? {
        payload: draftData.draft.payload,
        revision: Number(draftData.draft.revision ?? 1),
        updatedAt: draftData.draft.updatedAt,
      } : null;
      const localDraft = readLocalPosDraft(window.localStorage, activeShift.id);
      const recovery = choosePosRecoveryDraft(serverDraft, localDraft);
      draftRevisionRef.current = serverDraft?.revision ?? 0;
      setRecoveryDraft(recovery);
      autosaveReadyRef.current = !recovery;
      setDraftProtection(recovery?.conflict ? "CONFLICT" : serverDraft ? "SERVER" : localDraft ? "LOCAL" : "NONE");
    }
  }, []);

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const activeShift = await loadBootstrap();
      await Promise.all([
        loadProducts(activeShift),
        activeShift ? loadOffers() : Promise.resolve(),
      ]);
      if (!silent) setLoading(false);

      void Promise.all([
        activeShift ? loadCustomers() : Promise.resolve(),
        loadOperations(activeShift),
      ]).catch((error: any) => toast.error(error.message || "次要資料載入失敗，收銀仍可繼續使用"));
    } catch (error: any) {
      toast.error(error.message || "載入失敗");
      if (!silent) setLoading(false);
    }
  }, [loadBootstrap, loadCustomers, loadOffers, loadOperations, loadProducts]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    if (!shift) return;
    const requestKey = `${shift.id}:${query.trim().toLowerCase()}`;
    if (productRequestKeyRef.current === requestKey) return;
    productRequestKeyRef.current = requestKey;
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ warehouseId: shift.register.warehouseId });
      if (query.trim()) params.set("q", query.trim());
      void fetch(`/api/pos/products?${params}`, { cache: "no-store" })
        .then(async (res) => {
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "商品搜尋失敗");
          setProducts(data.items ?? []);
        })
        .catch((error) => {
          if (productRequestKeyRef.current === requestKey) productRequestKeyRef.current = "";
          toast.error(error.message);
        });
    }, query.trim() ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [query, shift]);

  useEffect(() => {
    if (!shift) return;
    const requestKey = customerQuery.trim().toLowerCase();
    if (customerRequestKeyRef.current === requestKey) return;
    customerRequestKeyRef.current = requestKey;
    const timer = window.setTimeout(() => {
      void loadCustomers(customerQuery).catch((error) => {
        if (customerRequestKeyRef.current === requestKey) customerRequestKeyRef.current = "";
        toast.error(error.message);
      });
    }, customerQuery.trim() ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [customerQuery, loadCustomers, shift]);

  useEffect(() => {
    if (!shift) return;
    if (offerRequestKeyRef.current === selectedCustomerId) return;
    void loadOffers(selectedCustomerId).catch((error) => toast.error(error.message));
  }, [loadOffers, selectedCustomerId, shift]);

  useEffect(() => {
    const focusScanner = (event: KeyboardEvent) => {
      if (event.key !== "F2") return;
      event.preventDefault();
      scanInputRef.current?.focus();
      scanInputRef.current?.select();
    };
    window.addEventListener("keydown", focusScanner);
    return () => window.removeEventListener("keydown", focusScanner);
  }, []);

  useEffect(() => {
    customerDisplayChannelRef.current = new BroadcastChannel("erin-pos-customer-display");
    return () => {
      customerDisplayChannelRef.current?.close();
      customerDisplayChannelRef.current = null;
    };
  }, []);

  const filteredProducts = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return products.slice(0, 40);
    return products.filter((product) =>
      product.name.toLowerCase().includes(value) ||
      product.sku.toLowerCase().includes(value) ||
      product.barcode?.toLowerCase().includes(value)
    ).slice(0, 40);
  }, [products, query]);

  const beforeOfferTotal = useMemo(() => Math.round(cart.reduce((sum, item) => sum + Number(item.product.salePrice) * item.quantity - item.discount, 0) * 100) / 100, [cart]);
  const activePromotion = useMemo(() => promotions
    .filter((offer) => Number(offer.minSpend) <= beforeOfferTotal)
    .map((offer) => ({ offer, discount: Math.min(beforeOfferTotal, Math.round((offer.kind === "PERCENT" ? beforeOfferTotal * Number(offer.value) / 100 : Number(offer.value)) * 100) / 100) }))
    .sort((a, b) => b.discount - a.discount || Number(b.offer.priority ?? 0) - Number(a.offer.priority ?? 0))[0] ?? null, [beforeOfferTotal, promotions]);
  const promotionDiscount = activePromotion?.discount ?? 0;
  const afterPromotion = Math.max(0, Math.round((beforeOfferTotal - promotionDiscount) * 100) / 100);
  const couponDiscount = appliedCoupon && Number(appliedCoupon.minSpend) <= beforeOfferTotal
    ? Math.min(afterPromotion, Number(appliedCoupon.maxDiscount ?? Number.POSITIVE_INFINITY), Math.round((appliedCoupon.kind === "PERCENT" ? afterPromotion * Number(appliedCoupon.value) / 100 : Number(appliedCoupon.value)) * 100) / 100)
    : 0;
  const pointsDiscount = selectedCustomerId ? Math.min(Math.max(0, Math.floor(Number(redeemPoints || 0))), loyaltyPoints, Math.floor(Math.max(0, afterPromotion - couponDiscount))) : 0;
  const total = Math.max(0, Math.round((afterPromotion - couponDiscount - pointsDiscount) * 100) / 100);
  const totalPaid = useMemo(() => Math.round(paymentLines.reduce((sum, payment) => sum + Number(payment.amount || 0), 0) * 100) / 100, [paymentLines]);
  const hasCashPayment = paymentLines.some((payment) => payment.method === "CASH" && Number(payment.amount || 0) > 0);
  const amountDue = Math.max(0, Math.round((total - totalPaid) * 100) / 100);
  const changeDue = hasCashPayment ? Math.max(0, Math.round((totalPaid - total) * 100) / 100) : 0;

  useEffect(() => {
    customerDisplayChannelRef.current?.postMessage({
      version: 1,
      updatedAt: new Date().toISOString(),
      items: cart.slice(-5).map((item) => ({ name: item.product.name, quantity: item.quantity, amount: Math.round((Number(item.product.salePrice) * item.quantity - item.discount) * 100) / 100 })),
      total,
      paid: totalPaid,
      change: changeDue,
      message: cart.length === 0 && lastReceipt ? `交易 ${lastReceipt.number} 完成，謝謝光臨` : "歡迎光臨",
    });
  }, [cart, changeDue, lastReceipt, total, totalPaid]);
  const refundEstimate = useMemo(() => {
    if (!refundSale) return 0;
    return Math.round((refundSale.items ?? []).reduce((sum: number, item: any) => {
      const quantity = Number(refundQty[item.id] ?? 0);
      return sum + Number(item.subtotal) * quantity / Number(item.quantity);
    }, 0) * 100) / 100;
  }, [refundQty, refundSale]);
  const manualDiscount = useMemo(() => Math.round(cart.reduce((sum, item) => sum + item.discount, 0) * 100) / 100, [cart]);
  const discountCartSignature = useMemo(() => JSON.stringify(cart.map((item) => ({ productId: item.product.id, quantity: item.quantity, discount: item.discount })).sort((a, b) => a.productId.localeCompare(b.productId))), [cart]);

  async function applyCouponCode() {
    if (!couponCode.trim()) {
      setAppliedCoupon(null);
      return;
    }
    try {
      const params = new URLSearchParams({ couponCode: couponCode.trim().toUpperCase() });
      if (selectedCustomerId) params.set("customerId", selectedCustomerId);
      const res = await fetch(`/api/pos/offers?${params}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "優惠券查詢失敗");
      const coupon = data.coupons?.[0];
      if (!coupon) throw new Error("優惠券不存在、未生效或已過期");
      setAppliedCoupon(coupon);
      setCouponCode(coupon.code);
      toast.success(`已套用優惠券：${coupon.name}`);
    } catch (error: any) {
      setAppliedCoupon(null);
      toast.error(error.message);
    }
  }

  async function requestDiscountApproval() {
    if (!shift || manualDiscount <= 0) return;
    if (discountReason.trim().length < 2) return toast.error("請輸入至少 2 個字的折扣原因");
    try {
      const res = await fetch("/api/pos/approvals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "REQUEST", cart: { shiftId: shift.id, items: cart.map((item) => ({ productId: item.product.id, quantity: item.quantity, discount: item.discount })), reason: discountReason } }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "折扣申請失敗");
      setDiscountApproval({ ...data.approval, cartSignature: discountCartSignature });
      toast.success(data.message);
    } catch (error: any) {
      toast.error(error.message);
    }
  }

  async function refreshDiscountApproval() {
    if (!discountApproval) return;
    try {
      const res = await fetch("/api/pos/approvals", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "核准狀態載入失敗");
      const current = data.items?.find((item: any) => item.id === discountApproval.id);
      if (!current) throw new Error("此折扣申請已拒絕或逾時，請重新申請");
      setDiscountApproval({ ...current, cartSignature: discountApproval.cartSignature });
      toast.success(current.status === "APPROVED" ? "店長已核准折扣" : "仍等待店長核准");
    } catch (error: any) {
      setDiscountApproval(null);
      toast.error(error.message);
    }
  }

  function currentCartPayload() {
    const items = cart.map((item) => ({ ...item, product: { ...item.product, salePrice: Number(item.product.salePrice) } }));
    return { version: 1 as const, items, customerId: selectedCustomerId || null, paymentLines, invoice: { mode: invoiceMode, buyerTaxId: invoiceBuyerTaxId, carrierId: invoiceCarrierId, donationCode: invoiceDonationCode }, pendingExchange, offer: { couponCode, appliedCoupon, redeemPoints, discountApproval, discountReason } };
  }

  function persistLocalCart(payload = currentCartPayload(), checkoutRequestId = checkoutRequestIdRef.current) {
    if (!shift) return;
    if (payload.items.length === 0) {
      clearLocalPosDraft(window.localStorage, shift.id);
      return;
    }
    writeLocalPosDraft(window.localStorage, {
      version: 1,
      shiftId: shift.id,
      savedAt: new Date().toISOString(),
      serverRevision: draftRevisionRef.current,
      checkoutRequestId,
      payload,
    });
    setDraftProtection("LOCAL");
  }

  useEffect(() => {
    if (!shift || !autosaveReadyRef.current) return;
    const payload = currentCartPayload();
    // localStorage is synchronous: preserve the latest edit before waiting for the
    // server debounce, so a power loss inside the next 700 ms cannot drop it.
    persistLocalCart(payload);
    const timer = window.setTimeout(() => {
      // Vercel 延遲可能高於 debounce。所有 PUT 必須串行，後一筆開始時才讀
      // 最新 revision，避免同一瀏覽器的兩個請求互相製造 409 假衝突。
      draftSaveQueueRef.current = draftSaveQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          if (!autosaveReadyRef.current || draftCheckedShiftRef.current !== shift.id) return;
          const res = await fetch("/api/pos/draft", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ shiftId: shift.id, payload, baseRevision: draftRevisionRef.current }),
          });
          const data = await res.json();
          if (!res.ok) {
            if (res.status === 409) {
              autosaveReadyRef.current = false;
              setDraftProtection("CONFLICT");
              const currentRes = await fetch(`/api/pos/draft?shiftId=${encodeURIComponent(shift.id)}`, { cache: "no-store" });
              const currentData = await currentRes.json();
              const serverDraft = currentData.draft ? { payload: currentData.draft.payload, revision: Number(currentData.draft.revision ?? 1), updatedAt: currentData.draft.updatedAt } : null;
              draftRevisionRef.current = serverDraft?.revision ?? 0;
              const localDraft = readLocalPosDraft(window.localStorage, shift.id);
              const recovery = choosePosRecoveryDraft(serverDraft, localDraft);
              setRecoveryDraft(recovery ? { ...recovery, conflict: true } : null);
            }
            throw new Error(data.error || "草稿儲存失敗");
          }
          if (data.cleared) {
            draftRevisionRef.current = 0;
            setDraftProtection("NONE");
            return;
          }
          draftRevisionRef.current = Number(data.draft?.revision ?? draftRevisionRef.current);
          if (payload.items.length) {
            // 若使用者已在前一筆慢速請求期間繼續編輯，保留 localStorage
            // 裡較新的內容，只把它所依據的伺服器 revision 向前推進。
            const latestLocal = readLocalPosDraft(window.localStorage, shift.id);
            const hasNewerLocalEdit = Boolean(latestLocal && JSON.stringify(latestLocal.payload) !== JSON.stringify(payload));
            writeLocalPosDraft(window.localStorage, latestLocal
              ? { ...latestLocal, serverRevision: draftRevisionRef.current }
              : { version: 1, shiftId: shift.id, savedAt: new Date().toISOString(), serverRevision: draftRevisionRef.current, checkoutRequestId: checkoutRequestIdRef.current, payload });
            setDraftProtection(hasNewerLocalEdit ? "LOCAL" : "SERVER");
          }
        })
        .catch((error) => { toast.error(`停電復原保護：已保存在本機，但伺服器同步失敗（${error.message}）`); });
    }, 700);
    return () => window.clearTimeout(timer);
  }, [appliedCoupon, cart, couponCode, discountApproval, discountReason, invoiceBuyerTaxId, invoiceCarrierId, invoiceDonationCode, invoiceMode, paymentLines, pendingExchange, redeemPoints, selectedCustomerId, shift]);

  function addProduct(product: Product) {
    if (product.stockTotal <= 0) return toast.error(`${product.name} 庫存不足`);
    setCart((items) => {
      const existing = items.find((item) => item.product.id === product.id);
      if (!existing) return [...items, { product, quantity: 1, discount: 0 }];
      if (existing.quantity >= product.stockTotal) {
        toast.error(`${product.name} 已達可售庫存`);
        return items;
      }
      return items.map((item) => item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
    });
    setQuery("");
    window.setTimeout(() => scanInputRef.current?.focus(), 0);
  }

  async function scanProduct() {
    const code = query.trim();
    if (!code || !shift) return;
    const local = products.find((product) => product.barcode?.toLowerCase() === code.toLowerCase() || product.sku.toLowerCase() === code.toLowerCase());
    if (local) return addProduct(local);
    try {
      const params = new URLSearchParams({ warehouseId: shift.register.warehouseId, scan: code });
      const res = await fetch(`/api/pos/products?${params}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "掃描失敗");
      addProduct(data.exact);
    } catch (error: any) {
      toast.error(error.message || "找不到此條碼");
      scanInputRef.current?.select();
    }
  }

  function changeQuantity(productId: string, delta: number) {
    setCart((items) => items.flatMap((item) => {
      if (item.product.id !== productId) return [item];
      const next = item.quantity + delta;
      if (next <= 0) return [];
      if (next > item.product.stockTotal) {
        toast.error("數量不可大於可售庫存");
        return [item];
      }
      return [{ ...item, quantity: next }];
    }));
  }

  function changeDiscount(productId: string, value: string) {
    const requested = Math.max(0, Number(value || 0));
    setCart((items) => items.map((item) => {
      if (item.product.id !== productId) return item;
      const maximum = Number(item.product.salePrice) * item.quantity;
      if (requested > maximum) {
        toast.error("折扣不可大於商品金額");
        return { ...item, discount: maximum };
      }
      return { ...item, discount: Math.round(requested * 100) / 100 };
    }));
  }

  function setSinglePayment(method: PaymentMethod) {
    setPaymentLines([{ method, amount: method === "CASH" ? "" : String(total), reference: "" }]);
  }

  function updatePayment(index: number, patch: Partial<PaymentLine>) {
    setPaymentLines((lines) => lines.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line));
  }

  function addPaymentLine() {
    setPaymentLines((lines) => {
      if (lines.length >= 4) {
        toast.error("單筆交易最多使用 4 種付款方式");
        return lines;
      }
      const paid = lines.reduce((sum, line) => sum + Number(line.amount || 0), 0);
      const remaining = Math.max(0, Math.round((total - paid) * 100) / 100);
      return [...lines, { method: "CARD", amount: remaining ? String(remaining) : "", reference: "" }];
    });
  }

  async function requestCashMovement() {
    if (!shift) return;
    if (Number(cashMovementAmount) <= 0 || cashMovementReason.trim().length < 2) return toast.error("請輸入正確金額與至少 2 個字的原因");
    setOperationBusy(true);
    try {
      const res = await fetch("/api/pos/cash-movements", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "REQUEST", shiftId: shift.id, type: cashMovementType, amount: Number(cashMovementAmount), reason: cashMovementReason }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "錢櫃異動申請失敗");
      toast.success(data.message || "已送出主管核准");
      setCashMovementAmount("");
      setCashMovementReason("");
      await loadOperations(shift);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setOperationBusy(false);
    }
  }

  async function decideCashMovement(movementId: string, action: "APPROVE" | "REJECT") {
    if (!shift) return;
    setOperationBusy(true);
    try {
      const res = await fetch("/api/pos/cash-movements", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, movementId }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "主管核准失敗");
      toast.success(action === "APPROVE" ? "錢櫃異動已核准" : "錢櫃異動已拒絕");
      await loadOperations(shift);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setOperationBusy(false);
    }
  }

  async function restoreCartPayload(payload: any) {
    if (!shift) return;
    const savedItems = Array.isArray(payload?.items) ? payload.items : [];
    const ids = savedItems.map((item: any) => item?.product?.id).filter(Boolean);
    if (!ids.length) return toast.error("暫存內容沒有商品");
    const params = new URLSearchParams({ warehouseId: shift.register.warehouseId, ids: ids.join(",") });
    const res = await fetch(`/api/pos/products?${params}`, { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "商品現況載入失敗");
    const currentById = new Map<string, Product>((data.items ?? []).map((product: Product) => [product.id, product]));
    const restored = savedItems.flatMap((saved: any) => {
      const product = currentById.get(saved.product.id);
      return product ? [{ product, quantity: Number(saved.quantity), discount: Number(saved.discount || 0) }] : [];
    });
    if (restored.length !== savedItems.length) toast.warning("部分商品已停用或不存在，未加入購物車");
    setCart(restored);
    setSelectedCustomerId(payload.customerId || "");
    setPaymentLines(Array.isArray(payload.paymentLines) && payload.paymentLines.length ? payload.paymentLines : [{ method: "CASH", amount: "", reference: "" }]);
    setInvoiceMode(payload.invoice?.mode || "NONE");
    setInvoiceBuyerTaxId(payload.invoice?.buyerTaxId || "");
    setInvoiceCarrierId(payload.invoice?.carrierId || "");
    setInvoiceDonationCode(payload.invoice?.donationCode || "");
    setPendingExchange(payload.pendingExchange || null);
    setCouponCode(payload.offer?.couponCode || "");
    setAppliedCoupon(payload.offer?.appliedCoupon || null);
    setRedeemPoints(Number(payload.offer?.redeemPoints || 0));
    setDiscountApproval(payload.offer?.discountApproval || null);
    setDiscountReason(payload.offer?.discountReason || "");
    window.setTimeout(() => scanInputRef.current?.focus(), 0);
  }

  async function holdCurrentSale() {
    if (!shift || cart.length === 0) return toast.error("購物車是空的");
    const label = holdLabel.trim() || `暫存 ${new Date().toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" })}`;
    setOperationBusy(true);
    try {
      const payload = currentCartPayload();
      const res = await fetch("/api/pos/holds", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "HOLD", shiftId: shift.id, label, payload }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "暫存失敗");
      autosaveReadyRef.current = true;
      setCart([]);
      setSelectedCustomerId("");
      setPaymentLines([{ method: "CASH", amount: "", reference: "" }]);
      setInvoiceMode("NONE");
      setInvoiceBuyerTaxId("");
      setInvoiceCarrierId("");
      setInvoiceDonationCode("");
      setPendingExchange(null);
      setHoldLabel("");
      clearLocalPosDraft(window.localStorage, shift.id);
      checkoutRequestIdRef.current = "";
      draftRevisionRef.current = 0;
      setDraftProtection("NONE");
      toast.success(`已暫存：${label}`);
      await loadOperations(shift);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setOperationBusy(false);
    }
  }

  async function handleHeldSale(holdId: string, action: "RESUME" | "CANCEL") {
    if (!shift) return;
    if (action === "RESUME" && cart.length > 0) return toast.error("請先完成或暫存目前購物車");
    setOperationBusy(true);
    try {
      const res = await fetch("/api/pos/holds", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, holdId, shiftId: shift.id }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "暫存單操作失敗");
      if (action === "RESUME") {
        await restoreCartPayload(data.payload);
        toast.success("暫存交易已取回，價格與庫存已重新確認");
        setHoldPanelOpen(false);
      } else {
        toast.success("暫存交易已取消");
      }
      await loadOperations(shift);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setOperationBusy(false);
    }
  }

  async function restoreRecoveryDraft() {
    if (!shift || !recoveryDraft) return;
    try {
      await restoreCartPayload(recoveryDraft.payload);
      checkoutRequestIdRef.current = recoveryDraft.checkoutRequestId || "";
      persistLocalCart(recoveryDraft.payload, checkoutRequestIdRef.current);
      setRecoveryDraft(null);
      autosaveReadyRef.current = true;
      toast.success(recoveryDraft.conflict ? "已選擇本機草稿，將以目前伺服器版本重新同步" : "停電復原草稿已載入");
    } catch (error: any) {
      toast.error(error.message);
    }
  }

  async function discardRecoveryDraft() {
    if (!shift) return;
    if (recoveryDraft?.conflict && recoveryDraft.serverDraft) {
      clearLocalPosDraft(window.localStorage, shift.id);
      await restoreCartPayload(recoveryDraft.serverDraft.payload);
      checkoutRequestIdRef.current = "";
      setRecoveryDraft(null);
      autosaveReadyRef.current = true;
      setDraftProtection("SERVER");
      toast.success("已使用伺服器草稿");
      return;
    }
    await fetch(`/api/pos/draft?shiftId=${encodeURIComponent(shift.id)}`, { method: "DELETE" });
    clearLocalPosDraft(window.localStorage, shift.id);
    checkoutRequestIdRef.current = "";
    draftRevisionRef.current = 0;
    setRecoveryDraft(null);
    autosaveReadyRef.current = true;
    setDraftProtection("NONE");
    toast.success("停電復原草稿已清除");
  }

  async function openShift() {
    if (!selectedRegister) return;
    setBusy(true);
    try {
      const res = await fetch("/api/pos/shifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "OPEN", registerId: selectedRegister, openingCash: Number(openingCash || 0) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "開班失敗");
      toast.success("開班完成，可以開始結帳");
      await refresh();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function previewCloseShift() {
    if (!shift) return;
    setBusy(true);
    try {
      const res = await fetch("/api/pos/shifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "PREVIEW", shiftId: shift.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "結班預覽失敗");
      setShiftPreview(data.summary);
      setClosingCash("");
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function closeShift() {
    if (!shift || closingCash === "") return toast.error("請輸入關帳實點現金");
    setBusy(true);
    try {
      const res = await fetch("/api/pos/shifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "CLOSE", shiftId: shift.id, closingCash: Number(closingCash) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "結班失敗");
      toast.success(`結班完成，現金差額 ${formatTwd(data.summary.difference)}`);
      setLastCloseSummary(data.summary);
      setShiftPreview(null);
      setCart([]);
      setClosingCash("");
      await refresh();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function searchSales() {
    try {
      const res = await fetch(`/api/pos/sales?q=${encodeURIComponent(saleQuery.trim())}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "交易查詢失敗");
      setRecentSales(data.items ?? []);
    } catch (error: any) {
      toast.error(error.message);
    }
  }

  async function openRefund(saleId: string) {
    if (!shift) return toast.error("請先開班才能退款");
    setRefundBusy(true);
    try {
      const res = await fetch(`/api/pos/sales/${saleId}`, { cache: "no-store" });
      const sale = await res.json();
      if (!res.ok) throw new Error(sale.error || "原交易載入失敗");
      setRefundSale(sale);
      setRefundQty(Object.fromEntries((sale.items ?? []).map((item: any) => [item.id, 0])));
      setRefundDisposition(Object.fromEntries((sale.items ?? []).map((item: any) => [item.id, "SELLABLE"])));
      setRefundWarehouseId(shift.register.warehouseId);
      setRefundAsExchange(false);
      setRefundReason("");
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setRefundBusy(false);
    }
  }

  async function submitRefund() {
    if (!shift || !refundSale) return;
    const items = refundSale.items.map((item: any) => ({
      saleItemId: item.id,
      quantity: Number(refundQty[item.id] ?? 0),
      disposition: refundDisposition[item.id] || "SELLABLE",
    })).filter((item: any) => Number.isFinite(item.quantity) && item.quantity > 0);
    if (!items.length) return toast.error("請至少輸入一筆本次退款數量");
    if (refundReason.trim().length < 2) return toast.error("請輸入至少 2 個字的退款原因");
    setRefundBusy(true);
    try {
      const res = await fetch("/api/pos/refunds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shiftId: shift.id, saleId: refundSale.id, returnWarehouseId: refundWarehouseId || shift.register.warehouseId, items, reason: refundReason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "退款失敗");
      toast.success(data.message || "退款完成");
      if (refundAsExchange) {
        setPendingExchange({ id: data.refund.id, number: data.refund.number });
        toast.success("已進入換貨模式，請掃描替換商品並完成下一筆結帳");
      }
      setRefundSale(null);
      await refresh();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setRefundBusy(false);
    }
  }

  async function checkout() {
    if (!shift || cart.length === 0) return;
    if (manualDiscount > 0 && !canApproveDiscount && (discountApproval?.status !== "APPROVED" || discountApproval.cartSignature !== discountCartSignature)) {
      return toast.error("手動折扣尚未取得店長核准，或核准後購物車已變更");
    }
    const payments = paymentLines
      .map((payment) => ({ ...payment, amount: Number(payment.amount || 0), reference: payment.reference.trim() || null }))
      .filter((payment) => Number.isFinite(payment.amount) && payment.amount > 0);
    if (!payments.length || totalPaid < total) return toast.error("付款金額不足");
    if (totalPaid > total && !payments.some((payment) => payment.method === "CASH")) return toast.error("非現金付款不可超收找零");
    setBusy(true);
    try {
      if (!checkoutRequestIdRef.current) checkoutRequestIdRef.current = crypto.randomUUID();
      persistLocalCart(currentCartPayload(), checkoutRequestIdRef.current);
      // 先等候已在途的草稿 PUT，避免交易完成後慢到的舊 PUT 重建已清除草稿。
      await draftSaveQueueRef.current;
      autosaveReadyRef.current = false;
      const res = await fetch("/api/pos/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: checkoutRequestIdRef.current,
          shiftId: shift.id,
          customerId: selectedCustomerId || null,
          exchangeRefundId: pendingExchange?.id || null,
          promotionId: activePromotion?.offer.id || null,
          couponCode: appliedCoupon?.code || null,
          redeemPoints: pointsDiscount,
          managerApprovalId: discountApproval?.status === "APPROVED" && discountApproval.cartSignature === discountCartSignature ? discountApproval.id : null,
          items: cart.map((item) => ({ productId: item.product.id, quantity: item.quantity, discount: item.discount })),
          payments,
          invoice: invoiceMode === "NONE" ? null : {
            mode: invoiceMode,
            buyerTaxId: invoiceBuyerTaxId.trim() || null,
            carrierId: invoiceCarrierId.trim().toUpperCase() || null,
            donationCode: invoiceDonationCode.trim() || null,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        // A 4xx response is a definitive business rejection. A 5xx response can
        // still mean the sale committed before the reply was interrupted, so keep
        // the request ID and let the idempotent endpoint look up the same result.
        if (res.status >= 400 && res.status < 500) {
          checkoutRequestIdRef.current = "";
          persistLocalCart(currentCartPayload(), "");
        }
        throw new Error(data.error || "結帳失敗");
      }
      setLastReceipt({ id: data.sale.id, number: data.sale.number, total: Number(data.sale.total), changeDue: Number(data.changeDue), electronicInvoice: data.sale.electronicInvoice ?? null });
      setCart([]);
      setPaymentLines([{ method: "CASH", amount: "", reference: "" }]);
      checkoutRequestIdRef.current = "";
      setSelectedCustomerId("");
      setCustomerQuery("");
      setInvoiceMode("NONE");
      setInvoiceBuyerTaxId("");
      setInvoiceCarrierId("");
      setInvoiceDonationCode("");
      setPendingExchange(null);
      setCouponCode("");
      setAppliedCoupon(null);
      setRedeemPoints(0);
      setDiscountApproval(null);
      setDiscountReason("");
      clearLocalPosDraft(window.localStorage, shift.id);
      draftRevisionRef.current = 0;
      setDraftProtection("NONE");
      toast.success("交易完成，庫存與帳務已同步");
      // 使用者看到交易完成後立即可操作；清草稿及統計/庫存刷新在背景完成，
      // 且 silent refresh 不再把整個 POS 換成全頁 loading。
      void (async () => {
        const draftRes = await fetch(`/api/pos/draft?shiftId=${encodeURIComponent(shift.id)}`, { method: "DELETE" });
        if (!draftRes.ok) throw new Error("伺服器草稿清除失敗");
        autosaveReadyRef.current = true;
        await refresh(true);
      })().catch((error) => {
        autosaveReadyRef.current = true;
        toast.error(`交易已完成，但背景更新失敗：${error.message}`);
      });
      window.setTimeout(() => scanInputRef.current?.focus(), 0);
    } catch (error: any) {
      autosaveReadyRef.current = true;
      if (checkoutRequestIdRef.current) toast.error("連線中斷，交易結果尚待確認。請勿再次收款；恢復連線後以同一購物車再次按結帳，系統會用防重複碼查回原交易。");
      else toast.error(error.message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
return <div className="grid min-h-[60vh] animate-pulse gap-4 xl:grid-cols-[minmax(0,1fr)_380px]" aria-label="正在載入 POS">
      <div className="space-y-4"><div className="h-20 rounded-2xl bg-muted" /><div className="grid grid-cols-2 gap-3 md:grid-cols-4">{Array.from({ length: 8 }).map((_, index) => <div key={index} className="h-32 rounded-2xl bg-muted" />)}</div></div>
      <div className="h-[520px] rounded-2xl bg-muted" />
    </div>;
  }

  if (!shift) {
    return (
      <div className="max-w-xl mx-auto mt-10 space-y-6">
        <div className="text-center">
          <div className="h-16 w-16 rounded-2xl bg-emerald-500/15 text-emerald-600 flex items-center justify-center mx-auto mb-4"><Store className="h-8 w-8" /></div>
          <h1 className="text-2xl font-bold">POS 開班</h1>
          <p className="text-sm text-muted-foreground mt-2">先確認收銀台與備用金，完成後才能進行交易。</p>
        </div>
        {lastCloseSummary && (
          <div className="rounded-2xl border border-indigo-200 bg-indigo-50/70 p-5 space-y-3 text-sm">
            <div className="font-bold text-indigo-900 flex items-center gap-2"><ReceiptText className="h-5 w-5" />上次結班結果</div>
            <div className="grid grid-cols-2 gap-3">
              <div><div className="text-muted-foreground">淨銷售</div><div className="font-semibold">{formatTwd(lastCloseSummary.netSales)}</div></div>
              <div><div className="text-muted-foreground">退款</div><div className="font-semibold text-rose-700">{formatTwd(lastCloseSummary.refunds)}</div></div>
              <div><div className="text-muted-foreground">應有現金</div><div className="font-semibold">{formatTwd(lastCloseSummary.expectedCash)}</div></div>
              <div><div className="text-muted-foreground">現金差額</div><div className={`font-bold ${Number(lastCloseSummary.difference) === 0 ? "text-emerald-700" : "text-rose-700"}`}>{formatTwd(Number(lastCloseSummary.difference))}</div></div>
            </div>
          </div>
        )}
        <div className="rounded-2xl border bg-card p-6 shadow-sm space-y-4">
          {registers.length === 0 ? (
            <div className="rounded-xl bg-amber-50 text-amber-800 p-4 text-sm">尚未建立收銀台。請先到系統設定建立倉庫與 POS 收銀台。</div>
          ) : (
            <>
              <label className="block text-sm font-medium">收銀台
                <select value={selectedRegister} onChange={(event) => setSelectedRegister(event.target.value)} className="mt-1 w-full h-11 rounded-lg border bg-background px-3">
                  {registers.map((register) => <option key={register.id} value={register.id}>{register.name} · {register.warehouse.name}</option>)}
                </select>
              </label>
              <label className="block text-sm font-medium">開班備用金
                <input value={openingCash} onChange={(event) => setOpeningCash(event.target.value)} inputMode="decimal" className="mt-1 w-full h-11 rounded-lg border bg-background px-3" />
              </label>
              <button onClick={openShift} disabled={busy} className="w-full h-12 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold disabled:opacity-50">{busy ? "開班中…" : "確認開班"}</button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2"><Store className="h-6 w-6 text-emerald-600" /><h1 className="text-2xl font-bold">POS 門市收銀</h1></div>
          <p className="text-sm text-muted-foreground mt-1">{shift.register.name} · 今日 {today.sales} 筆 · 淨額 {formatTwd(today.amount)}{today.refundAmount > 0 ? `（退款 ${formatTwd(today.refundAmount)}）` : ""} · 草稿保護：{draftProtection === "SERVER" ? "伺服器已同步" : draftProtection === "LOCAL" ? "本機已保存、待同步" : draftProtection === "CONFLICT" ? "等待選擇版本" : "待命"}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setCashPanelOpen(true)} className="h-10 px-4 rounded-lg border hover:bg-muted text-sm inline-flex items-center gap-2"><CircleDollarSign className="h-4 w-4" />錢櫃異動{cashMovements.some((movement) => movement.status === "PENDING") ? `（${cashMovements.filter((movement) => movement.status === "PENDING").length} 待核）` : ""}</button>
          <button onClick={() => setHoldPanelOpen(true)} className="h-10 px-4 rounded-lg border hover:bg-muted text-sm inline-flex items-center gap-2"><ArchiveRestore className="h-4 w-4" />暫存／取回{heldSales.length ? `（${heldSales.length}）` : ""}</button>
          <button onClick={previewCloseShift} disabled={busy} className="h-10 px-4 rounded-lg border hover:bg-muted text-sm">預覽結班</button>
          <button onClick={() => { void refresh(); }} className="h-10 w-10 inline-flex items-center justify-center rounded-lg border hover:bg-muted" aria-label="重新整理"><RefreshCw className="h-4 w-4" /></button>
        </div>
      </header>

      {recoveryDraft && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3"><AlertTriangle className="h-5 w-5 mt-0.5 shrink-0" /><div><div className="font-bold">{recoveryDraft.conflict ? "本機與伺服器草稿版本不同" : "找到未完成的停電復原草稿"}</div><div className="text-sm mt-1">儲存時間 {new Date(recoveryDraft.updatedAt).toLocaleString("zh-TW")}，共 {recoveryDraft.payload?.items?.length ?? 0} 個品項。{recoveryDraft.conflict ? "請明確選擇要保留的版本；系統不會靜默覆蓋。" : "取回時會重新檢查目前價格與庫存。"}</div></div></div>
          <div className="flex gap-2"><button onClick={discardRecoveryDraft} className="h-10 px-4 rounded-lg border border-amber-300 bg-white">{recoveryDraft.conflict ? "使用伺服器版本" : "放棄草稿"}</button><button onClick={restoreRecoveryDraft} className="h-10 px-4 rounded-lg bg-amber-600 text-white font-semibold">{recoveryDraft.conflict ? "使用本機版本" : "取回草稿"}</button></div>
        </div>
      )}

      {pendingExchange && (
        <div className="rounded-xl border border-indigo-300 bg-indigo-50 p-4 text-indigo-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div><div className="font-bold">換貨進行中 · 退款單 {pendingExchange.number}</div><div className="text-sm mt-1">請掃描替換商品並結帳；新銷售會與原退款單一對一連結。</div></div>
          <button onClick={() => setPendingExchange(null)} className="h-9 px-4 rounded-lg border border-indigo-300 bg-white">取消換貨連結</button>
        </div>
      )}

      {lastReceipt && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-900 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3"><CheckCircle2 className="h-5 w-5 mt-0.5" /><div className="text-sm"><div>交易 {lastReceipt.number} 完成 · {formatTwd(lastReceipt.total)} · 找零 {formatTwd(lastReceipt.changeDue)}</div>{lastReceipt.electronicInvoice && <div className="mt-1 text-xs">{lastReceipt.electronicInvoice.status === "ISSUED" ? `${lastReceipt.electronicInvoice.provider === "MOCK" ? "測試電子發票（不可報稅）" : "電子發票"}：${lastReceipt.electronicInvoice.invoiceNumber}` : `電子發票待處理：${lastReceipt.electronicInvoice.status}${lastReceipt.electronicInvoice.lastError ? `（${lastReceipt.electronicInvoice.lastError}）` : ""}`}</div>}</div></div>
          <div className="flex items-center gap-2">
            <button onClick={() => window.open(`/print/pos/${lastReceipt.id}`, "_blank", "noopener,noreferrer")} className="h-9 px-3 rounded-lg border border-emerald-300 bg-white/80 hover:bg-white text-sm font-semibold inline-flex items-center gap-2"><Printer className="h-4 w-4" />列印 80mm 收據</button>
            <button onClick={() => setLastReceipt(null)} aria-label="關閉交易提示"><X className="h-4 w-4" /></button>
          </div>
        </div>
      )}

      <div className="grid xl:grid-cols-[1fr_430px] gap-4 items-start">
        <section className="rounded-2xl border bg-card shadow-sm overflow-hidden">
          <div className="p-4 border-b relative">
            <Barcode className="absolute left-7 top-7 h-4 w-4 text-muted-foreground" />
            <input
              ref={scanInputRef}
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                void scanProduct();
              }}
              placeholder="掃描條碼，或搜尋品名／SKU（Enter 加入，F2 回到掃描框）"
              className="w-full h-11 rounded-xl border bg-background pl-10 pr-4"
            />
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground"><span>支援 USB／藍牙 HID 掃描器</span><span>不限前 200 筆商品，會查詢完整商品主檔</span></div>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3 p-4 max-h-[68vh] overflow-y-auto">
            {filteredProducts.map((product) => (
              <button key={product.id} onClick={() => addProduct(product)} disabled={product.stockTotal <= 0} className="text-left rounded-xl border p-4 hover:border-emerald-400 hover:bg-emerald-50/40 disabled:opacity-45 disabled:hover:bg-transparent transition min-h-28">
                <div className="text-xs text-muted-foreground font-mono">{product.sku}</div>
                <div className="font-semibold mt-1 line-clamp-2">{product.name}</div>
                {product.spec && <div className="text-xs text-muted-foreground mt-1 line-clamp-1">{product.spec}</div>}
                <div className="flex items-end justify-between mt-4 gap-2"><span className="font-bold text-emerald-700">{formatTwd(Number(product.salePrice))}</span><span className="text-xs text-muted-foreground">庫存 {product.stockTotal}</span></div>
              </button>
            ))}
            {filteredProducts.length === 0 && <div className="col-span-full py-16 text-center text-muted-foreground"><Search className="h-8 w-8 mx-auto mb-2 opacity-40" />找不到商品</div>}
          </div>
        </section>

        <aside className="rounded-2xl border bg-card shadow-sm overflow-hidden xl:sticky xl:top-4">
          <div className="p-4 border-b flex items-center justify-between"><div className="font-bold flex items-center gap-2"><ShoppingCart className="h-5 w-5" />本筆交易</div><span className="text-xs text-muted-foreground">{cart.reduce((sum, item) => sum + item.quantity, 0)} 件</span></div>
          <div className="max-h-[40vh] overflow-y-auto divide-y">
            {cart.length === 0 && <div className="py-16 text-center text-sm text-muted-foreground">掃描條碼或點選商品加入</div>}
            {cart.map((item) => (
              <div key={item.product.id} className="p-4 space-y-3">
                <div className="flex justify-between gap-3"><div><div className="font-medium">{item.product.name}</div><div className="text-xs text-muted-foreground">{item.product.sku}</div></div><button onClick={() => setCart((items) => items.filter((cartItem) => cartItem.product.id !== item.product.id))} aria-label={`移除 ${item.product.name}`}><X className="h-4 w-4 text-muted-foreground" /></button></div>
                <div className="flex items-center justify-between gap-3"><div className="inline-flex items-center rounded-lg border"><button onClick={() => changeQuantity(item.product.id, -1)} className="h-8 w-8 inline-flex items-center justify-center"><Minus className="h-3 w-3" /></button><span className="w-10 text-center text-sm font-semibold">{item.quantity}</span><button onClick={() => changeQuantity(item.product.id, 1)} className="h-8 w-8 inline-flex items-center justify-center"><Plus className="h-3 w-3" /></button></div><span className="font-semibold">{formatTwd(Number(item.product.salePrice) * item.quantity - item.discount)}</span></div>
                <label className="flex items-center justify-between gap-3 text-xs text-muted-foreground"><span className="inline-flex items-center gap-1"><Percent className="h-3 w-3" />本列折扣金額</span><input type="number" min="0" step="1" value={item.discount || ""} onChange={(event) => changeDiscount(item.product.id, event.target.value)} className="h-8 w-28 rounded-lg border bg-background px-2 text-right text-foreground" placeholder="0" /></label>
              </div>
            ))}
          </div>
          <div className="border-t p-4 space-y-4">
            <div className="rounded-xl border p-3 space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold"><UserRound className="h-4 w-4" />會員／客戶</div>
              <input value={customerQuery} onChange={(event) => setCustomerQuery(event.target.value)} placeholder="搜尋姓名、電話或統編" className="h-9 w-full rounded-lg border bg-background px-3 text-sm" />
              <select value={selectedCustomerId} onChange={(event) => setSelectedCustomerId(event.target.value)} className="h-10 w-full rounded-lg border bg-background px-3 text-sm">
                <option value="">門市散客（不帶會員）</option>
                {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.companyName} · {customer.code}{customer.phone ? ` · ${customer.phone}` : ""}</option>)}
              </select>
              {selectedCustomerId && <div className="text-xs rounded-lg bg-indigo-50 px-3 py-2 text-indigo-800">會員可用點數：<strong>{loyaltyPoints}</strong> 點 · 本筆每滿 NT$100 累積 1 點</div>}
            </div>
            <div className="rounded-xl border p-3 space-y-3">
              <div className="text-sm font-semibold">促銷／優惠券／會員點數</div>
              {activePromotion ? <div className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">自動套用：{activePromotion.offer.name}（-{formatTwd(promotionDiscount)}）</div> : <div className="text-xs text-muted-foreground">目前沒有符合門檻的自動促銷</div>}
              <div className="flex gap-2"><input value={couponCode} onChange={(event) => { setCouponCode(event.target.value.toUpperCase()); setAppliedCoupon(null); }} placeholder="優惠券代碼" className="h-9 flex-1 rounded-lg border bg-background px-3 text-sm uppercase" /><button onClick={applyCouponCode} className="h-9 px-3 rounded-lg border text-sm">套用</button></div>
              {appliedCoupon && <div className="text-xs text-indigo-700">{appliedCoupon.name}：-{formatTwd(couponDiscount)}</div>}
              {selectedCustomerId && <label className="flex items-center justify-between gap-3 text-xs"><span>點數折抵（1 點 = NT$1）</span><input type="number" min="0" max={Math.min(loyaltyPoints, Math.floor(afterPromotion - couponDiscount))} value={redeemPoints || ""} onChange={(event) => setRedeemPoints(Math.max(0, Math.floor(Number(event.target.value || 0))))} className="h-8 w-28 rounded-lg border bg-background px-2 text-right" placeholder="0" /></label>}
              {manualDiscount > 0 && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2 text-xs"><div className="font-semibold text-amber-900">手動折扣 {formatTwd(manualDiscount)} {canApproveDiscount ? "· 店長權限直接授權" : "· 需店長授權"}</div>{!canApproveDiscount && <><input value={discountReason} onChange={(event) => setDiscountReason(event.target.value)} placeholder="折扣原因" className="h-8 w-full rounded border bg-white px-2" /><div className="flex items-center gap-2"><button onClick={requestDiscountApproval} className="h-8 px-3 rounded bg-amber-600 text-white">送出申請</button>{discountApproval && <button onClick={refreshDiscountApproval} className="h-8 px-3 rounded border bg-white">更新狀態</button>}<span>{discountApproval?.cartSignature !== discountCartSignature ? "購物車已變更，需重申請" : discountApproval?.status === "APPROVED" ? "已核准" : discountApproval ? "等待核准" : ""}</span></div></>}</div>}
            </div>
            <div className="rounded-xl border p-3 space-y-2">
              <div className="flex items-center justify-between gap-2"><div className="text-sm font-semibold flex items-center gap-2"><ReceiptText className="h-4 w-4" />發票／收據</div><span className="text-[10px] rounded bg-amber-100 px-2 py-0.5 text-amber-800">本機為測試開票</span></div>
              <select value={invoiceMode} onChange={(event) => setInvoiceMode(event.target.value as InvoiceMode)} className="h-10 w-full rounded-lg border bg-background px-3 text-sm">
                <option value="NONE">交易收據（不開電子發票）</option>
                <option value="PAPER">紙本證明聯</option>
                <option value="MOBILE_CARRIER">手機條碼載具</option>
                <option value="CITIZEN_CERT">自然人憑證載具</option>
                <option value="DONATION">捐贈發票</option>
                <option value="BUSINESS">公司戶／買方統編</option>
              </select>
              {(invoiceMode === "MOBILE_CARRIER" || invoiceMode === "CITIZEN_CERT") && <input value={invoiceCarrierId} onChange={(event) => setInvoiceCarrierId(event.target.value.toUpperCase())} placeholder={invoiceMode === "MOBILE_CARRIER" ? "手機條碼，例如 /ABC1234" : "自然人憑證載具號碼"} className="h-9 w-full rounded-lg border bg-background px-3 text-sm font-mono uppercase" />}
              {invoiceMode === "DONATION" && <input value={invoiceDonationCode} onChange={(event) => setInvoiceDonationCode(event.target.value.replace(/\D/g, ""))} placeholder="捐贈碼（3–7 碼）" inputMode="numeric" className="h-9 w-full rounded-lg border bg-background px-3 text-sm" />}
              {invoiceMode === "BUSINESS" && <input value={invoiceBuyerTaxId} onChange={(event) => setInvoiceBuyerTaxId(event.target.value.replace(/\D/g, "").slice(0, 8))} placeholder="買方統一編號（8 碼）" inputMode="numeric" className="h-9 w-full rounded-lg border bg-background px-3 text-sm" />}
              {invoiceMode !== "NONE" && <div className="text-[11px] leading-relaxed text-muted-foreground">現在只驗證開票佇列與欄位；正式上線仍需財政部 Turnkey／VAN 憑證、字軌及測試平台驗證。</div>}
            </div>
            <div className="space-y-1 text-xs text-muted-foreground">{beforeOfferTotal !== total && <><div className="flex justify-between"><span>促銷前金額</span><span>{formatTwd(beforeOfferTotal)}</span></div><div className="flex justify-between"><span>促銷／券／點數折抵</span><span>-{formatTwd(promotionDiscount + couponDiscount + pointsDiscount)}</span></div></>}</div>
            <div className="flex items-end justify-between"><span className="text-sm text-muted-foreground">應收總額（含稅）</span><span className="text-3xl font-black text-emerald-700">{formatTwd(total)}</span></div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setSinglePayment("CASH")} className="h-10 rounded-xl border hover:bg-emerald-50 flex items-center justify-center gap-2 text-sm"><Banknote className="h-4 w-4" />現金</button>
              <button onClick={() => setSinglePayment("CARD")} className="h-10 rounded-xl border hover:bg-indigo-50 flex items-center justify-center gap-2 text-sm"><CreditCard className="h-4 w-4" />刷卡</button>
              <button onClick={() => setSinglePayment("MOBILE")} className="h-10 rounded-xl border hover:bg-indigo-50 flex items-center justify-center gap-2 text-sm"><WalletCards className="h-4 w-4" />行動支付</button>
              <button onClick={() => setSinglePayment("TRANSFER")} className="h-10 rounded-xl border hover:bg-indigo-50 flex items-center justify-center gap-2 text-sm"><WalletCards className="h-4 w-4" />轉帳</button>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between"><div className="text-sm font-semibold">付款明細</div><button onClick={addPaymentLine} disabled={paymentLines.length >= 4} className="text-xs text-indigo-700 disabled:opacity-40">＋ 分拆付款</button></div>
              {paymentLines.map((payment, index) => (
                <div key={index} className="rounded-xl border p-2 space-y-2">
                  <div className="grid grid-cols-[120px_1fr_auto] gap-2">
                    <select value={payment.method} onChange={(event) => updatePayment(index, { method: event.target.value as PaymentMethod })} className="h-10 rounded-lg border bg-background px-2 text-sm">
                      <option value="CASH">現金</option><option value="CARD">刷卡</option><option value="MOBILE">行動支付</option><option value="TRANSFER">轉帳</option>
                    </select>
                    <input value={payment.amount} onChange={(event) => updatePayment(index, { amount: event.target.value })} inputMode="decimal" placeholder="收款金額" className="h-10 min-w-0 rounded-lg border bg-background px-3 text-right font-semibold" />
                    <button onClick={() => setPaymentLines((lines) => lines.filter((_, lineIndex) => lineIndex !== index))} disabled={paymentLines.length === 1} aria-label={`刪除第 ${index + 1} 筆付款`} className="h-10 w-9 rounded-lg border disabled:opacity-30"><X className="h-4 w-4 mx-auto" /></button>
                  </div>
                  {payment.method !== "CASH" && <input value={payment.reference} onChange={(event) => updatePayment(index, { reference: event.target.value })} placeholder="交易序號／末四碼（選填）" className="h-9 w-full rounded-lg border bg-background px-3 text-xs" />}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="rounded-lg bg-muted/50 p-2"><div className="text-muted-foreground">已收</div><div className="font-bold mt-1">{formatTwd(totalPaid)}</div></div>
              <div className="rounded-lg bg-amber-50 p-2"><div className="text-amber-700">尚差</div><div className="font-bold mt-1 text-amber-800">{formatTwd(amountDue)}</div></div>
              <div className="rounded-lg bg-emerald-50 p-2"><div className="text-emerald-700">找零</div><div className="font-bold mt-1 text-emerald-800">{formatTwd(changeDue)}</div></div>
            </div>
            <button onClick={checkout} disabled={busy || cart.length === 0 || totalPaid < total || (totalPaid > total && !hasCashPayment)} className="w-full h-14 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-lg font-bold disabled:opacity-45 flex items-center justify-center gap-2">{busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}確認結帳</button>
          </div>
        </aside>
      </div>

      <section className="rounded-2xl border bg-card shadow-sm overflow-hidden">
        <div className="p-4 border-b flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <div className="font-bold flex items-center gap-2"><ReceiptText className="h-5 w-5" />原交易查詢與退款</div>
            <div className="text-xs text-muted-foreground mt-1">退款必須引用原交易，系統會限制可退數量並依原付款方式退款。</div>
          </div>
          <div className="flex gap-2 w-full md:w-auto">
            <input
              value={saleQuery}
              onChange={(event) => setSaleQuery(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") void searchSales(); }}
              placeholder="交易單號／收據號／客戶"
              className="h-10 min-w-0 md:w-64 flex-1 rounded-lg border bg-background px-3 text-sm"
            />
            <button onClick={searchSales} className="h-10 px-4 rounded-lg border hover:bg-muted text-sm">查詢</button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="p-3 text-left">交易單號</th>
                <th className="p-3 text-left">時間</th>
                <th className="p-3 text-left">客戶／收銀台</th>
                <th className="p-3 text-right">原金額</th>
                <th className="p-3 text-right">已退款</th>
                <th className="p-3 text-left">狀態</th>
                <th className="p-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {recentSales.map((sale) => {
                const refundable = ["COMPLETED", "PARTIALLY_REFUNDED"].includes(sale.status) && sale.refundableQuantity !== 0;
                const statusLabel = sale.status === "COMPLETED" ? "已完成" : sale.status === "PARTIALLY_REFUNDED" ? "部分退款" : sale.status === "REFUNDED" ? "已全退" : "已作廢";
                return (
                  <tr key={sale.id} className="border-t">
                    <td className="p-3 font-mono text-xs">{sale.number}</td>
                    <td className="p-3">{new Date(sale.createdAt).toLocaleString("zh-TW")}</td>
                    <td className="p-3">{sale.customer?.companyName || "門市散客"}<div className="text-xs text-muted-foreground">{sale.register?.name}</div></td>
                    <td className="p-3 text-right">{formatTwd(Number(sale.total))}</td>
                    <td className="p-3 text-right text-rose-700">{formatTwd(Number(sale.refundedTotal ?? 0))}</td>
                    <td className="p-3"><span className={`rounded-full px-2 py-1 text-xs ${sale.status === "REFUNDED" ? "bg-slate-100" : sale.status === "PARTIALLY_REFUNDED" ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>{statusLabel}</span></td>
                    <td className="p-3 text-right"><button disabled={!refundable || refundBusy} onClick={() => openRefund(sale.id)} className="h-9 px-3 rounded-lg border hover:bg-muted disabled:opacity-40 inline-flex items-center gap-1"><RotateCcw className="h-4 w-4" />退款</button></td>
                  </tr>
                );
              })}
              {recentSales.length === 0 && <tr><td colSpan={7} className="p-10 text-center text-muted-foreground">找不到交易</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {cashPanelOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 p-4 flex items-center justify-center" role="dialog" aria-modal="true" aria-label="錢櫃投入提出與抽離">
          <div className="w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-2xl bg-background shadow-2xl">
            <div className="p-5 border-b flex items-center justify-between"><div><div className="text-lg font-bold flex items-center gap-2"><CircleDollarSign className="h-5 w-5" />錢櫃投入／提出／抽離</div><div className="text-xs text-muted-foreground mt-1">所有異動先申請，核准後才列入應有現金與結班差額。</div></div><button onClick={() => setCashPanelOpen(false)} aria-label="關閉錢櫃異動"><X className="h-5 w-5" /></button></div>
            <div className="p-5 space-y-5">
              <div className="grid gap-3 rounded-xl border bg-muted/30 p-4 md:grid-cols-[180px_160px_1fr_auto]">
                <select value={cashMovementType} onChange={(event) => setCashMovementType(event.target.value as any)} className="h-10 rounded-lg border bg-background px-3 text-sm"><option value="PAID_IN">投入現金</option><option value="PAID_OUT">提出現金</option><option value="SAFE_DROP">營業中抽離／入庫</option></select>
                <input value={cashMovementAmount} onChange={(event) => setCashMovementAmount(event.target.value)} inputMode="decimal" placeholder="金額" className="h-10 rounded-lg border bg-background px-3 text-right" />
                <input value={cashMovementReason} onChange={(event) => setCashMovementReason(event.target.value)} placeholder="原因，例如：補充零錢、支付臨時運費" className="h-10 min-w-0 rounded-lg border bg-background px-3" />
                <button onClick={requestCashMovement} disabled={operationBusy} className="h-10 px-4 rounded-lg bg-indigo-600 text-white font-semibold disabled:opacity-40">送出申請</button>
              </div>
              <div className="overflow-x-auto rounded-xl border">
                <table className="w-full min-w-[760px] text-sm"><thead className="bg-muted/50"><tr><th className="p-3 text-left">時間</th><th className="p-3 text-left">類型</th><th className="p-3 text-right">金額</th><th className="p-3 text-left">原因</th><th className="p-3 text-left">狀態</th><th className="p-3 text-right">主管操作</th></tr></thead><tbody>
                  {cashMovements.map((movement) => <tr key={movement.id} className="border-t"><td className="p-3">{new Date(movement.requestedAt).toLocaleString("zh-TW")}</td><td className="p-3">{CASH_MOVEMENT_LABELS[movement.type]}</td><td className="p-3 text-right font-semibold">{formatTwd(Number(movement.amount))}</td><td className="p-3">{movement.reason}</td><td className="p-3">{OPERATION_STATUS_LABELS[movement.status] || movement.status}</td><td className="p-3 text-right">{movement.status === "PENDING" && canApproveCash ? <div className="inline-flex gap-2"><button onClick={() => decideCashMovement(movement.id, "REJECT")} disabled={operationBusy} className="h-8 px-3 rounded-lg border">拒絕</button><button onClick={() => decideCashMovement(movement.id, "APPROVE")} disabled={operationBusy} className="h-8 px-3 rounded-lg bg-emerald-600 text-white inline-flex items-center gap-1"><ShieldCheck className="h-4 w-4" />核准</button></div> : <span className="text-xs text-muted-foreground">{movement.status === "PENDING" ? "等待主管" : "—"}</span>}</td></tr>)}
                  {cashMovements.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">本班次尚無錢櫃異動</td></tr>}
                </tbody></table>
              </div>
            </div>
          </div>
        </div>
      )}

      {holdPanelOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 p-4 flex items-center justify-center" role="dialog" aria-modal="true" aria-label="伺服器暫存與取回交易">
          <div className="w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-2xl bg-background shadow-2xl">
            <div className="p-5 border-b flex items-center justify-between"><div><div className="text-lg font-bold flex items-center gap-2"><ArchiveRestore className="h-5 w-5" />伺服器暫存／取回交易</div><div className="text-xs text-muted-foreground mt-1">最多 20 筆；儲存在本機伺服器資料庫，不依賴目前瀏覽器分頁。</div></div><button onClick={() => setHoldPanelOpen(false)} aria-label="關閉暫存交易"><X className="h-5 w-5" /></button></div>
            <div className="p-5 space-y-5">
              <div className="rounded-xl border bg-muted/30 p-4 flex flex-col md:flex-row gap-3">
                <input value={holdLabel} onChange={(event) => setHoldLabel(event.target.value)} placeholder="暫存名稱，例如：王小姐稍後付款" className="h-10 flex-1 rounded-lg border bg-background px-3" />
                <button onClick={holdCurrentSale} disabled={operationBusy || cart.length === 0} className="h-10 px-4 rounded-lg bg-indigo-600 text-white font-semibold disabled:opacity-40 inline-flex items-center justify-center gap-2"><Archive className="h-4 w-4" />暫存目前購物車（{cart.length} 項）</button>
              </div>
              <div className="space-y-3">
                {heldSales.map((hold) => <div key={hold.id} className="rounded-xl border p-4 flex flex-col md:flex-row md:items-center justify-between gap-3"><div><div className="font-semibold">{hold.label}</div><div className="text-xs text-muted-foreground mt-1">{new Date(hold.createdAt).toLocaleString("zh-TW")} · {hold.payload?.items?.length ?? 0} 個品項</div></div><div className="flex gap-2"><button onClick={() => handleHeldSale(hold.id, "CANCEL")} disabled={operationBusy} className="h-9 px-3 rounded-lg border">取消暫存</button><button onClick={() => handleHeldSale(hold.id, "RESUME")} disabled={operationBusy || cart.length > 0} className="h-9 px-3 rounded-lg bg-emerald-600 text-white font-semibold">取回交易</button></div></div>)}
                {heldSales.length === 0 && <div className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">目前沒有暫存交易</div>}
              </div>
            </div>
          </div>
        </div>
      )}

      {refundSale && (
        <div className="fixed inset-0 z-50 bg-black/50 p-4 flex items-center justify-center" role="dialog" aria-modal="true" aria-label="POS 原交易退款">
          <div className="w-full max-w-4xl max-h-[92vh] overflow-y-auto rounded-2xl bg-background shadow-2xl">
            <div className="p-5 border-b flex items-start justify-between gap-4">
              <div><div className="text-lg font-bold">原交易退款 · {refundSale.number}</div><div className="text-sm text-muted-foreground mt-1">原金額 {formatTwd(Number(refundSale.total))} · {refundSale.register?.name}／{refundSale.register?.warehouse?.name}</div></div>
              <button onClick={() => setRefundSale(null)} disabled={refundBusy} aria-label="關閉退款視窗"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-5 space-y-5">
              <div className="rounded-xl bg-muted/40 p-4 text-sm">
                <div className="font-medium mb-2">原付款方式</div>
                <div className="flex flex-wrap gap-2">{refundSale.payments?.map((payment: any) => <span key={payment.id} className="rounded-lg border bg-background px-3 py-1">{payment.method} {formatTwd(Number(payment.amount))}</span>)}</div>
              </div>
              <label className="block text-sm font-medium">退貨受理門市／入庫倉庫
                <select value={refundWarehouseId} onChange={(event) => setRefundWarehouseId(event.target.value)} disabled={refundBusy} className="mt-1 h-10 w-full rounded-lg border bg-background px-3">
                  {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.code} · {warehouse.name}{warehouse.id !== refundSale.register?.warehouse?.id ? "（跨店退貨）" : ""}</option>)}
                </select>
              </label>
              <div className="overflow-x-auto border rounded-xl">
                <table className="w-full text-sm min-w-[900px]">
                  <thead className="bg-muted/50 text-xs text-muted-foreground"><tr><th className="p-3 text-left">商品</th><th className="p-3 text-right">原數量</th><th className="p-3 text-right">已退</th><th className="p-3 text-right">可退</th><th className="p-3 text-right">本次退款</th><th className="p-3 text-left">退回品況</th><th className="p-3 text-right">原小計</th></tr></thead>
                  <tbody>{refundSale.items.map((item: any) => {
                    const remaining = Math.max(0, Math.round((Number(item.quantity) - Number(item.returnedQty)) * 10_000) / 10_000);
                    return <tr key={item.id} className="border-t"><td className="p-3"><div className="font-medium">{item.product?.name}</div><div className="text-xs text-muted-foreground font-mono">{item.product?.sku}</div></td><td className="p-3 text-right">{Number(item.quantity)}</td><td className="p-3 text-right">{Number(item.returnedQty)}</td><td className="p-3 text-right font-semibold">{remaining}</td><td className="p-3"><input type="number" min="0" max={remaining} step="0.0001" disabled={remaining <= 0 || refundBusy} value={refundQty[item.id] ?? 0} onChange={(event) => setRefundQty((current) => ({ ...current, [item.id]: event.target.value }))} className="ml-auto block h-9 w-28 rounded-lg border bg-background px-2 text-right" /></td><td className="p-3"><select value={refundDisposition[item.id] || "SELLABLE"} onChange={(event) => setRefundDisposition((current) => ({ ...current, [item.id]: event.target.value as any }))} disabled={remaining <= 0 || refundBusy} className="h-9 rounded-lg border bg-background px-2"><option value="SELLABLE">良品／回可售庫存</option><option value="DAMAGED">瑕疵／不回庫</option><option value="SCRAP">報廢／不回庫</option></select></td><td className="p-3 text-right">{formatTwd(Number(item.subtotal))}</td></tr>;
                  })}</tbody>
                </table>
              </div>
              <label className="flex items-start gap-3 rounded-xl border border-indigo-200 bg-indigo-50/60 p-4 text-sm"><input type="checkbox" checked={refundAsExchange} onChange={(event) => setRefundAsExchange(event.target.checked)} disabled={refundBusy} className="mt-1" /><span><strong>這是換貨</strong><span className="block text-xs text-muted-foreground mt-1">完成退款後保留換貨連結，下一筆新銷售結帳時會與這張退款單綁定。</span></span></label>
              {refundSale.refunds?.length > 0 && <div className="text-sm"><div className="font-medium mb-2">歷次退款</div><div className="space-y-1">{refundSale.refunds.map((refund: any) => <div key={refund.id} className="flex justify-between rounded-lg bg-muted/40 px-3 py-2"><span>{refund.number} · {refund.reason}</span><span className="font-medium">{formatTwd(Number(refund.total))}</span></div>)}</div></div>}
              <label className="block text-sm font-medium">退款原因（必填）<textarea value={refundReason} onChange={(event) => setRefundReason(event.target.value)} disabled={refundBusy} placeholder="例如：商品瑕疵、尺寸不合" className="mt-1 w-full min-h-20 rounded-xl border bg-background p-3" /></label>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t pt-4">
                <div><div className="text-xs text-muted-foreground">本次預估退款（實際以逐筆稅額尾差為準）</div><div className="text-2xl font-black text-rose-700">{formatTwd(refundEstimate)}</div></div>
                <div className="flex gap-2"><button onClick={() => setRefundSale(null)} disabled={refundBusy} className="h-11 px-5 rounded-xl border">取消</button><button onClick={submitRefund} disabled={refundBusy || refundEstimate <= 0} className="h-11 px-5 rounded-xl bg-rose-600 text-white font-bold disabled:opacity-40 inline-flex items-center gap-2">{refundBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}確認退款</button></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {shiftPreview && (
        <div className="fixed inset-0 z-50 bg-black/50 p-4 flex items-center justify-center" role="dialog" aria-modal="true" aria-label="結班預覽">
          <div className="w-full max-w-xl max-h-[92vh] overflow-y-auto rounded-2xl bg-background shadow-2xl">
            <div className="p-5 border-b flex items-center justify-between"><div className="text-lg font-bold">結班預覽</div><button onClick={() => setShiftPreview(null)} disabled={busy} aria-label="關閉結班預覽"><X className="h-5 w-5" /></button></div>
            <div className="p-5 space-y-5">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl bg-muted/40 p-3"><div className="text-muted-foreground">銷售總額／筆數</div><div className="font-bold mt-1">{formatTwd(shiftPreview.grossSales)}／{shiftPreview.saleCount}</div></div>
                <div className="rounded-xl bg-muted/40 p-3"><div className="text-muted-foreground">退款總額／筆數</div><div className="font-bold text-rose-700 mt-1">{formatTwd(shiftPreview.refunds)}／{shiftPreview.refundCount}</div></div>
                <div className="rounded-xl bg-muted/40 p-3"><div className="text-muted-foreground">淨銷售</div><div className="font-bold mt-1">{formatTwd(shiftPreview.netSales)}</div></div>
                <div className="rounded-xl bg-emerald-50 p-3"><div className="text-emerald-700">應有現金（含備用金）</div><div className="font-black text-emerald-800 mt-1">{formatTwd(shiftPreview.expectedCash)}</div></div>
              </div>
              <div className="overflow-x-auto border rounded-xl"><table className="w-full text-sm"><thead className="bg-muted/50 text-xs text-muted-foreground"><tr><th className="p-2 text-left">付款方式</th><th className="p-2 text-right">收款</th><th className="p-2 text-right">退款</th><th className="p-2 text-right">淨額</th></tr></thead><tbody>{shiftPreview.payments.map((payment) => <tr key={payment.method} className="border-t"><td className="p-2">{payment.method}</td><td className="p-2 text-right">{formatTwd(payment.sales)}</td><td className="p-2 text-right text-rose-700">{formatTwd(payment.refunds)}</td><td className="p-2 text-right font-medium">{formatTwd(payment.net)}</td></tr>)}</tbody></table></div>
              {shiftPreview.cashMovements && <div className="grid grid-cols-3 gap-2 text-xs"><div className="rounded-lg bg-emerald-50 p-3"><div className="text-emerald-700">核准投入</div><div className="font-bold mt-1">{formatTwd(shiftPreview.cashMovements.paidIn)}</div></div><div className="rounded-lg bg-rose-50 p-3"><div className="text-rose-700">核准提出</div><div className="font-bold mt-1">{formatTwd(shiftPreview.cashMovements.paidOut)}</div></div><div className="rounded-lg bg-indigo-50 p-3"><div className="text-indigo-700">營業中抽離</div><div className="font-bold mt-1">{formatTwd(shiftPreview.cashMovements.safeDrop)}</div></div></div>}
              {Boolean((shiftPreview.pendingMovementCount ?? 0) + (shiftPreview.heldSaleCount ?? 0) + (shiftPreview.draftCount ?? 0)) && <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">結班前待處理：錢櫃申請 {shiftPreview.pendingMovementCount ?? 0} 筆、暫存交易 {shiftPreview.heldSaleCount ?? 0} 筆、復原草稿 {shiftPreview.draftCount ?? 0} 筆。</div>}
              <label className="block text-sm font-medium">實點現金<input autoFocus value={closingCash} onChange={(event) => setClosingCash(event.target.value)} inputMode="decimal" placeholder="請輸入實際點收金額" className="mt-1 w-full h-12 rounded-xl border bg-background px-3 text-lg font-semibold" /></label>
              <div className="rounded-xl border p-4 flex items-center justify-between"><span className="text-sm text-muted-foreground">預計現金差額</span><span className={`text-xl font-black ${closingCash !== "" && Number(closingCash) === shiftPreview.expectedCash ? "text-emerald-700" : "text-rose-700"}`}>{closingCash === "" ? "—" : formatTwd(Number(closingCash) - shiftPreview.expectedCash)}</span></div>
              <div className="flex justify-end gap-2"><button onClick={() => setShiftPreview(null)} disabled={busy} className="h-11 px-5 rounded-xl border">繼續營業</button><button onClick={closeShift} disabled={busy || closingCash === ""} className="h-11 px-5 rounded-xl bg-indigo-600 text-white font-bold disabled:opacity-40">確認結班</button></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
