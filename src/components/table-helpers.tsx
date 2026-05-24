"use client";
import React, { useEffect, useState } from "react";

/**
 * 表格操作提示
 */
export function TableHint() {
  return (
    <p className="sr-only">
      表格支援拖曳欄位排序、點擊儲存格編輯，以及 Enter、方向鍵、Tab、Escape 鍵盤操作。
    </p>
  );
}

export function useDebouncedValue<T>(value: T, delay = 300) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

/**
 * 拖曳欄位排序 hook
 */
export function useColumnDrag(moduleKey: string, defaultKeys: string[]) {
  const storageKey = `erp_col_order_${moduleKey}`;
  const [dragCol, setDragCol] = useState<string | null>(null);
  const [colOrder, setColOrder] = useState<string[]>(() => {
    if (typeof window === "undefined") return defaultKeys;
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved) as string[];
        const valid = parsed.filter((k) => defaultKeys.includes(k));
        const missing = defaultKeys.filter((k) => !valid.includes(k));
        return [...valid, ...missing];
      }
    } catch {}
    return defaultKeys;
  });

  function handleDragStart(key: string) { setDragCol(key); }
  function handleDragOver(e: React.DragEvent) { e.preventDefault(); }
  function handleDrop(targetKey: string) {
    if (!dragCol || dragCol === targetKey) { setDragCol(null); return; }
    const order = [...colOrder];
    const fromIdx = order.indexOf(dragCol);
    const toIdx = order.indexOf(targetKey);
    if (fromIdx === -1 || toIdx === -1) { setDragCol(null); return; }
    order.splice(fromIdx, 1);
    order.splice(toIdx, 0, dragCol);
    setColOrder(order);
    localStorage.setItem(storageKey, JSON.stringify(order));
    setDragCol(null);
  }

  function thProps(key: string) {
    return {
      draggable: true,
      onDragStart: () => handleDragStart(key),
      onDragOver: handleDragOver,
      onDrop: () => handleDrop(key),
      style: dragCol === key ? { opacity: 0.65, background: "hsl(var(--muted))" } as React.CSSProperties : undefined,
      className: "cursor-grab select-none hover:text-foreground",
      title: "拖曳調整欄位順序",
    };
  }

  return { colOrder, dragCol, thProps };
}
