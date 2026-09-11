"use client";
import { useTranslations } from "next-intl";
import React, { useEffect, useState } from "react";

const SESSION_CACHE_PREFIX = "erp_table_cache:";
const DEFAULT_CACHE_MAX_AGE_MS = 5 * 60 * 1000;

export function readSessionCache<T>(key: string, maxAgeMs = DEFAULT_CACHE_MAX_AGE_MS): T | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = sessionStorage.getItem(`${SESSION_CACHE_PREFIX}${key}`);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as { at: number; data: T };
    if (!parsed?.at || Date.now() - parsed.at > maxAgeMs) return undefined;
    return parsed.data;
  } catch {
    return undefined;
  }
}

export function writeSessionCache<T>(key: string, data: T) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(`${SESSION_CACHE_PREFIX}${key}`, JSON.stringify({ at: Date.now(), data }));
  } catch {}
}

export function TableSkeletonRows({ rows = 6, columns }: { rows?: number; columns: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <tr key={rowIndex} className="border-b transition-colors">
          {Array.from({ length: columns }).map((__, columnIndex) => (
            <td key={columnIndex} className="p-3 align-middle">
              <div
                className={`h-4 animate-pulse rounded-md bg-muted ${
                  columnIndex % 4 === 0 ? "w-20" : columnIndex % 3 === 0 ? "w-32" : "w-full"
                }`}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

/**
 * 表格操作提示
 */
export function TableHint() {
  const t = useTranslations("table");
  return (
    <div className="text-xs text-muted-foreground mb-2 space-y-1">
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <span>🖱️ <strong>{t("hintDrag")}</strong>{t("hintDragBody")}</span>
        <span>✏️ <strong>{t("hintClickEdit")}</strong>{t("hintClickEditBody")}</span>
        <span>⌨️ <strong>{t("hintArrows")}</strong>{t("hintArrowsBody")}</span>
        <span>↵ <strong>Enter</strong>{t("hintEnterBody")}</span>
        <span>⇥ <strong>Tab</strong>{t("hintTabBody")}</span>
        <span>📋 <strong>{t("hintCopyPaste")}</strong>{t("hintCopyPasteBody")}</span>
        <span>🖱️ <strong>{t("hintRightClick")}</strong>{t("hintRightClickBody")}</span>
        <span>⎋ <strong>Escape</strong>{t("hintEscBody")}</span>
      </div>
    </div>
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
  const t = useTranslations("table");
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
      title: t("dragToReorder"),
    };
  }

  return { colOrder, dragCol, thProps };
}
