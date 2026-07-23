import { readFileSync, writeFileSync } from "node:fs";

const path = "src/app/(app)/pos/restaurant/restaurant-workspace.tsx";
let source = readFileSync(path, "utf8");

function replaceRequired(pattern, replacement, label) {
  if (!pattern.test(source)) throw new Error(`找不到要修正的區塊：${label}`);
  source = source.replace(pattern, replacement);
}

if (!source.includes('useMemo, useRef, useState')) {
  source = source.replace(
    'import { useCallback, useEffect, useMemo, useState } from "react";',
    'import { useCallback, useEffect, useMemo, useRef, useState } from "react";',
  );
}

if (!source.includes('const addQueueRef = useRef')) {
  const anchor = '  const checkoutRequestIdRef = useRef("");\n';
  if (!source.includes(anchor)) throw new Error("找不到餐飲結帳 request ref");
  source = source.replace(
    anchor,
    `${anchor}  const addQueueRef = useRef(new Map<string, { orderId: string; product: Product; queued: number; inFlight: boolean; timer: number | null }>());\n`,
  );
}

if (!source.includes('blocking = true')) {
  source = source.replace(
    '  async function action(payload: Record<string, unknown>, success?: string, refresh = true) {\n    setBusy(true);',
    '  async function action(payload: Record<string, unknown>, success?: string, refresh = true, blocking = true) {\n    if (blocking) setBusy(true);',
  );
  source = source.replace(
    '    } finally {\n      setBusy(false);\n    }\n  }\n\n  async function openTable',
    '    } finally {\n      if (blocking) setBusy(false);\n    }\n  }\n\n  async function openTable',
  );
}

if (!source.includes('async function flushAddQueue')) {
  replaceRequired(
    /\n  (?:async )?function addItem\(product: Product\) \{[\s\S]*?\n  }\n\n  async function updateItem/,
    `
  function addItem(product: Product) {
    if (!selectedOrder) return;
    const orderId = selectedOrder.id;
    const key = \`${orderId}:\${product.id}\`;

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
        id: \`optimistic:\${key}\`,
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

  async function updateItem`,
    "餐飲點餐即時佇列",
  );
}

writeFileSync(path, source);
console.log("Restaurant order queue v7 applied");
