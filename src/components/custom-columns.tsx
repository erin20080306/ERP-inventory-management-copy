"use client";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Trash2, Settings2, ArrowUp, ArrowDown, GripVertical } from "lucide-react";

export type CustomColumn = {
  id: string;
  label: string;
  type: "text" | "number" | "date";
};

const STORAGE_KEY_PREFIX = "erp_custom_cols_";

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

  useEffect(() => {
    setColumns(getCustomColumns(module));
  }, [module]);

  function save(cols: CustomColumn[]) {
    setCustomColumns(module, cols);
    setColumns(cols);
  }

  return { columns, open, setOpen, save };
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
  onSave: (cols: CustomColumn[]) => void;
}) {
  const [draft, setDraft] = useState<CustomColumn[]>([]);

  useEffect(() => {
    if (open) setDraft([...columns]);
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

  function save() {
    const valid = draft.filter((c) => c.label.trim());
    onSave(valid);
    onClose();
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
              <Button size="sm" variant="ghost" onClick={() => removeColumn(idx)}>
                <Trash2 className="h-4 w-4 text-red-500" />
              </Button>
            </div>
          ))}
        </div>
        <Button variant="outline" className="w-full" onClick={addColumn}>
          <Plus className="h-4 w-4 mr-1" />新增欄位
        </Button>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={save}>儲存</Button>
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
