"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Trash2, Settings2, ArrowUp, ArrowDown, GripVertical, Copy, ClipboardPaste, Eraser } from "lucide-react";
import { isCustomFieldModule } from "@/lib/custom-fields";
import { toast } from "sonner";

export type CustomColumn = {
  id: string;
  label: string;
  type: "text" | "number" | "date";
};

const STORAGE_KEY_PREFIX = "erp_custom_cols_";
const MIGRATION_MAP_PREFIX = "erp_custom_cols_server_map_";

export function getCustomColumns(module: string): CustomColumn[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PREFIX + module);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function setCustomColumns(module: string, cols: CustomColumn[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY_PREFIX + module, JSON.stringify(cols));
}

export function getCustomFieldValues(module: string, rowId: string): Record<string, any> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${module}_data_${rowId}`);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function setCustomFieldValue(module: string, rowId: string, colId: string, value: any) {
  if (typeof window === "undefined") return;
  const current = getCustomFieldValues(module, rowId);
  current[colId] = value;
  localStorage.setItem(`${STORAGE_KEY_PREFIX}${module}_data_${rowId}`, JSON.stringify(current));
}

export function useCustomColumns(module: string) {
  const [columns, setColumns] = useState<CustomColumn[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const serverSynced = isCustomFieldModule(module);

  useEffect(() => {
    if (!serverSynced) {
      setColumns(getCustomColumns(module));
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    fetch(`/api/custom-fields/columns?module=${encodeURIComponent(module)}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || "自訂欄位載入失敗");
        let nextColumns: CustomColumn[] = result.columns ?? [];
        const localColumns = getCustomColumns(module);
        if (nextColumns.length === 0 && localColumns.length > 0) {
          const migrateResponse = await fetch("/api/custom-fields/columns", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ module, columns: localColumns }),
          });
          const migrated = await migrateResponse.json().catch(() => ({}));
          if (!migrateResponse.ok) throw new Error(migrated.error || "舊版本機欄位移轉失敗");
          nextColumns = migrated.columns ?? [];
          const idMap = Object.fromEntries(localColumns.flatMap((column, index) => nextColumns[index]?.id ? [[column.id, nextColumns[index].id]] : []));
          localStorage.setItem(MIGRATION_MAP_PREFIX + module, JSON.stringify(idMap));
          toast.success("舊版本機自訂欄位已移轉到公司伺服器");
        }
        setColumns(nextColumns);
      })
      .catch((error) => {
        if (error.name !== "AbortError") toast.error(error.message || "自訂欄位載入失敗");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [module, serverSynced]);

  async function save(cols: CustomColumn[]) {
    if (!serverSynced) {
      setCustomColumns(module, cols);
      setColumns(cols);
      return;
    }
    const response = await fetch("/api/custom-fields/columns", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ module, columns: cols }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "自訂欄位儲存失敗");
    setColumns(result.columns ?? []);
  }

  return { columns, open, setOpen, save, loading, serverSynced };
}

type CustomFieldValues = Record<string, Record<string, string>>;
export type CustomFieldChange = { rowId: string; columnId: string; value: string | null };

export function useCustomFieldValues(module: string, rowIds: string[]) {
  const serverSynced = isCustomFieldModule(module);
  const rowIdsKey = useMemo(() => [...new Set(rowIds.filter(Boolean))].join(","), [rowIds]);
  const [values, setValues] = useState<CustomFieldValues>({});

  useEffect(() => {
    if (!serverSynced) {
      const next: CustomFieldValues = {};
      for (const rowId of rowIdsKey.split(",").filter(Boolean)) next[rowId] = getCustomFieldValues(module, rowId);
      setValues(next);
      return;
    }
    if (!rowIdsKey) {
      setValues({});
      return;
    }
    const controller = new AbortController();
    const params = new URLSearchParams({ module, rowIds: rowIdsKey });
    fetch(`/api/custom-fields/values?${params}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || "自訂欄位內容載入失敗");
        const nextValues: CustomFieldValues = result.values ?? {};
        const rawMap = localStorage.getItem(MIGRATION_MAP_PREFIX + module);
        if (rawMap) {
          const idMap = JSON.parse(rawMap) as Record<string, string>;
          const changes: CustomFieldChange[] = [];
          for (const rowId of rowIdsKey.split(",").filter(Boolean)) {
            const localValues = getCustomFieldValues(module, rowId);
            for (const [localColumnId, value] of Object.entries(localValues)) {
              const serverColumnId = idMap[localColumnId];
              if (!serverColumnId || nextValues[rowId]?.[serverColumnId] !== undefined) continue;
              changes.push({ rowId, columnId: serverColumnId, value: String(value ?? "") });
              nextValues[rowId] ||= {};
              nextValues[rowId][serverColumnId] = String(value ?? "");
            }
          }
          if (changes.length > 0) {
            const migrateResponse = await fetch("/api/custom-fields/values", {
              method: changes.length === 1 ? "PUT" : "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(changes.length === 1 ? { module, ...changes[0] } : { module, values: changes }),
            });
            const migrated = await migrateResponse.json().catch(() => ({}));
            if (!migrateResponse.ok) throw new Error(migrated.error || "舊版欄位內容移轉失敗");
            for (const rowId of new Set(changes.map((change) => change.rowId))) {
              localStorage.removeItem(`${STORAGE_KEY_PREFIX}${module}_data_${rowId}`);
            }
          }
        }
        setValues(nextValues);
      })
      .catch((error) => {
        if (error.name !== "AbortError") toast.error(error.message || "自訂欄位內容載入失敗");
      });
    return () => controller.abort();
  }, [module, rowIdsKey, serverSynced]);

  const getValues = useCallback((rowId: string) => values[rowId] ?? {}, [values]);
  const saveValues = useCallback(async (changes: CustomFieldChange[]) => {
    if (changes.length === 0) return;
    const previous = changes.map((change) => ({
      ...change,
      value: values[change.rowId]?.[change.columnId] ?? "",
    }));
    setValues((current) => {
      const next = { ...current };
      for (const change of changes) {
        next[change.rowId] = { ...(next[change.rowId] ?? {}), [change.columnId]: change.value ?? "" };
      }
      return next;
    });
    if (!serverSynced) {
      for (const change of changes) setCustomFieldValue(module, change.rowId, change.columnId, change.value ?? "");
      return;
    }
    try {
      const response = await fetch("/api/custom-fields/values", {
        method: changes.length === 1 ? "PUT" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(changes.length === 1 ? { module, ...changes[0] } : { module, values: changes }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "自訂欄位內容儲存失敗");
    } catch (error: any) {
      setValues((current) => {
        const next = { ...current };
        for (const change of previous) {
          next[change.rowId] = { ...(next[change.rowId] ?? {}), [change.columnId]: change.value ?? "" };
        }
        return next;
      });
      toast.error(error.message || "自訂欄位內容儲存失敗");
      throw error;
    }
  }, [module, serverSynced, values]);

  const saveValue = useCallback(async (rowId: string, columnId: string, value: string) => {
    await saveValues([{ rowId, columnId, value }]);
  }, [saveValues]);

  return { values, getValues, saveValue, saveValues, serverSynced };
}

export function CustomFieldGridCell({
  gridId,
  rowId,
  rowIndex,
  column,
  columnIndex,
  rowIds,
  columns,
  value,
  saveValues,
  onManageColumns,
}: {
  gridId: string;
  rowId: string;
  rowIndex: number;
  column: CustomColumn;
  columnIndex: number;
  rowIds: string[];
  columns: CustomColumn[];
  value: string;
  saveValues: (changes: CustomFieldChange[]) => Promise<void>;
  onManageColumns: () => void;
}) {
  const [draft, setDraft] = useState(value);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setDraft(value), [value]);
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [menu]);

  const focusCell = useCallback((nextRow: number, nextColumn: number) => {
    const candidates = document.querySelectorAll<HTMLInputElement>("input[data-erp-custom-grid]");
    const target = [...candidates].find((element) =>
      element.dataset.erpCustomGrid === gridId &&
      Number(element.dataset.erpRow) === nextRow &&
      Number(element.dataset.erpColumn) === nextColumn
    );
    target?.focus();
    target?.select();
  }, [gridId]);

  const commit = useCallback(async (nextValue = draft) => {
    if (nextValue === value) return;
    await saveValues([{ rowId, columnId: column.id, value: nextValue }]);
  }, [column.id, draft, rowId, saveValues, value]);

  async function pasteGrid(text: string) {
    const normalized = text.replace(/\r/g, "").replace(/\n$/, "");
    const matrix = normalized.split("\n").map((line) => line.split("\t"));
    const changes: CustomFieldChange[] = [];
    matrix.forEach((line, rowOffset) => {
      const targetRowId = rowIds[rowIndex + rowOffset];
      if (!targetRowId) return;
      line.forEach((cell, columnOffset) => {
        const targetColumn = columns[columnIndex + columnOffset];
        if (!targetColumn) return;
        changes.push({ rowId: targetRowId, columnId: targetColumn.id, value: cell });
      });
    });
    if (!changes.length) return;
    setDraft(changes[0].value ?? "");
    await saveValues(changes);
    const lastRow = Math.min(rowIds.length - 1, rowIndex + matrix.length - 1);
    const widest = Math.max(...matrix.map((line) => line.length));
    const lastColumn = Math.min(columns.length - 1, columnIndex + widest - 1);
    requestAnimationFrame(() => focusCell(lastRow, lastColumn));
    toast.success(`已同步貼上 ${changes.length} 格`);
  }

  return (
    <>
      <Input
        ref={inputRef}
        type={column.type === "number" ? "number" : column.type === "date" ? "date" : "text"}
        value={draft}
        data-erp-custom-grid={gridId}
        data-erp-row={rowIndex}
        data-erp-column={columnIndex}
        aria-label={`${column.label}，第 ${rowIndex + 1} 列`}
        className="h-8 min-w-[96px] rounded-none border-0 bg-transparent px-1 text-xs shadow-none focus-visible:ring-2 focus-visible:ring-inset"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => { void commit(); }}
        onPaste={(event) => {
          const text = event.clipboardData.getData("text/plain");
          if (text.includes("\t") || /[\r\n]/.test(text)) {
            event.preventDefault();
            void pasteGrid(text);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            setDraft(value);
            inputRef.current?.blur();
            return;
          }
          let nextRow = rowIndex;
          let nextColumn = columnIndex;
          if (event.key === "Enter" || event.key === "ArrowDown") nextRow += 1;
          else if (event.key === "ArrowUp") nextRow -= 1;
          else if (event.key === "ArrowRight" || (event.key === "Tab" && !event.shiftKey)) nextColumn += 1;
          else if (event.key === "ArrowLeft" || (event.key === "Tab" && event.shiftKey)) nextColumn -= 1;
          else return;
          event.preventDefault();
          if (nextColumn >= columns.length) { nextColumn = 0; nextRow += 1; }
          if (nextColumn < 0) { nextColumn = columns.length - 1; nextRow -= 1; }
          nextRow = Math.max(0, Math.min(rowIds.length - 1, nextRow));
          void commit().finally(() => requestAnimationFrame(() => focusCell(nextRow, nextColumn)));
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          setMenu({ x: Math.min(event.clientX, window.innerWidth - 230), y: Math.min(event.clientY, window.innerHeight - 210) });
        }}
      />
      {menu && createPortal(
        <div role="menu" aria-label="自訂欄位右鍵選單" className="fixed z-[200] w-56 rounded-lg border bg-popover p-1 text-sm shadow-xl" style={{ left: menu.x, top: menu.y }} onClick={(event) => event.stopPropagation()}>
          <button type="button" className="flex w-full items-center gap-2 rounded px-3 py-2 text-left hover:bg-muted" onClick={async () => { await navigator.clipboard.writeText(draft); setMenu(null); }}><Copy className="h-4 w-4" />複製儲存格</button>
          <button type="button" className="flex w-full items-center gap-2 rounded px-3 py-2 text-left hover:bg-muted" onClick={async () => { const text = await navigator.clipboard.readText(); await pasteGrid(text); setMenu(null); }}><ClipboardPaste className="h-4 w-4" />從此格貼上</button>
          <button type="button" className="flex w-full items-center gap-2 rounded px-3 py-2 text-left hover:bg-muted" onClick={async () => { setDraft(""); await saveValues([{ rowId, columnId: column.id, value: "" }]); setMenu(null); }}><Eraser className="h-4 w-4" />清除此格</button>
          <button type="button" className="flex w-full items-center gap-2 rounded px-3 py-2 text-left hover:bg-muted" onClick={() => { onManageColumns(); setMenu(null); }}><Settings2 className="h-4 w-4" />新增／刪減欄位</button>
        </div>,
        document.body,
      )}
    </>
  );
}

export function CustomColumnDialog({
  module,
  columns,
  open,
  onClose,
  onSave,
}: {
  module: string;
  columns: CustomColumn[];
  open: boolean;
  onClose: () => void;
  onSave: (cols: CustomColumn[]) => void | Promise<void>;
}) {
  const [draft, setDraft] = useState<CustomColumn[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    if (open) {
      setDraft([...columns]);
      setSaveError("");
    }
  }, [open, columns]);

  function addColumn() {
    setDraft([...draft, { id: `c_${Date.now()}`, label: "", type: "text" }]);
  }

  function updateColumn(idx: number, patch: Partial<CustomColumn>) {
    const next = [...draft];
    next[idx] = { ...next[idx], ...patch };
    setDraft(next);
  }

  function removeColumn(idx: number) {
    setDraft(draft.filter((_, i) => i !== idx));
  }

  function moveColumn(idx: number, dir: -1 | 1) {
    const target = idx + dir;
    if (target < 0 || target >= draft.length) return;
    const next = [...draft];
    [next[idx], next[target]] = [next[target], next[idx]];
    setDraft(next);
  }

  async function save() {
    const valid = draft.filter((c) => c.label.trim());
    const normalized = valid.map((column) => column.label.trim().toLocaleLowerCase("zh-TW"));
    if (new Set(normalized).size !== normalized.length) {
      setSaveError("欄位名稱不可重複");
      return;
    }
    setSaving(true);
    setSaveError("");
    try {
      await onSave(valid);
      toast.success("自訂欄位已同步");
      onClose();
    } catch (error: any) {
      setSaveError(error.message || "自訂欄位儲存失敗");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>自訂欄位管理</DialogTitle>
          <p className="text-xs text-muted-foreground">使用 ↑↓ 按鈕調整欄位顯示順序，表頭欄位也可直接拖曳排序</p>
        </DialogHeader>
        <div className="space-y-3 max-h-80 overflow-y-auto">
          {draft.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">尚無自訂欄位，點下方按鈕新增</p>
          )}
          {draft.map((col, idx) => (
            <div key={col.id} className="flex items-center gap-2 group">
              <GripVertical className="h-4 w-4 text-muted-foreground/50 flex-shrink-0" />
              <span className="text-xs text-muted-foreground w-5 text-center flex-shrink-0">{idx + 1}</span>
              <Input
                placeholder="欄位名稱"
                value={col.label}
                onChange={(e) => updateColumn(idx, { label: e.target.value })}
                className="flex-1"
              />
              <select
                value={col.type}
                onChange={(e) => updateColumn(idx, { type: e.target.value as any })}
                className="h-10 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="text">文字</option>
                <option value="number">數字</option>
                <option value="date">日期</option>
              </select>
              <div className="flex flex-col">
                <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => moveColumn(idx, -1)} disabled={idx === 0} title="上移">
                  <ArrowUp className="h-3 w-3" />
                </Button>
                <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => moveColumn(idx, 1)} disabled={idx === draft.length - 1} title="下移">
                  <ArrowDown className="h-3 w-3" />
                </Button>
              </div>
              <Button size="sm" variant="ghost" onClick={() => removeColumn(idx)} aria-label={`刪除欄位 ${col.label || idx + 1}`}>
                <Trash2 className="h-4 w-4 text-red-500" />
              </Button>
            </div>
          ))}
        </div>
        <Button variant="outline" className="w-full" onClick={addColumn}>
          <Plus className="h-4 w-4 mr-1" />新增欄位
        </Button>
        {saveError && <p role="alert" className="text-sm text-destructive">{saveError}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>取消</Button>
          <Button onClick={() => void save()} disabled={saving}>{saving ? "同步中..." : "儲存並同步"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CustomColumnButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="outline" size="sm" onClick={onClick} title="自訂欄位">
      <Settings2 className="h-4 w-4 mr-1" />欄位
    </Button>
  );
}
