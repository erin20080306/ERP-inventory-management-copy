"use client";
import React, { useState } from "react";

/**
 * 表格操作提示
 */
export function TableHint() {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
      <span>💡 可拖曳表頭欄位調整順序 ｜ 點擊儲存格直接編輯 ｜ Enter/↓ 下一列 ｜ ↑ 上一列 ｜ Tab 下一欄 ｜ Esc 取消</span>
    </div>
  );
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
      style: dragCol === key ? { opacity: 0.5, background: "rgba(96, 165, 250, 0.3)" } as React.CSSProperties : undefined,
      className: "cursor-grab select-none",
      title: "拖曳調整欄位順序",
    };
  }

  return { colOrder, dragCol, thProps };
}
