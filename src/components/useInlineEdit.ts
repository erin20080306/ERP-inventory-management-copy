import { useState, useCallback, useEffect } from "react";

type EditCell = { rowId: string; field: string };

export function useInlineEdit<T extends Record<string, any>>(
  data: T[],
  onSave: (rowId: string, field: string, value: any) => void | Promise<void>,
  editableFields: string[] = []
) {
  const [editingCell, setEditingCell] = useState<EditCell | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Partial<T>>>({});

  const startEdit = useCallback((rowId: string, field: string) => {
    setEditingCell({ rowId, field });
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingCell(null);
  }, []);

  const updateDraft = useCallback((rowId: string, field: string, value: any) => {
    setDrafts((prev) => ({
      ...prev,
      [rowId]: { ...prev[rowId], [field]: value },
    }));
  }, []);

  const saveAndMove = useCallback(async (direction: "down" | "up" | "right" | "stay") => {
    if (!editingCell) return;

    const { rowId, field } = editingCell;
    const draft = drafts[rowId];
    if (draft && draft[field] !== undefined) {
      await onSave(rowId, field, draft[field]);
      setDrafts((prev) => {
        const newDrafts = { ...prev };
        delete newDrafts[rowId];
        return newDrafts;
      });
    }

    // Calculate next cell
    const currentIndex = data.findIndex((r) => r.id === rowId);
    const fieldIndex = editableFields.indexOf(field);

    let nextRowId = rowId;
    let nextField = field;

    if (direction === "down" && currentIndex < data.length - 1) {
      nextRowId = data[currentIndex + 1].id;
    } else if (direction === "up" && currentIndex > 0) {
      nextRowId = data[currentIndex - 1].id;
    } else if (direction === "right" && fieldIndex < editableFields.length - 1) {
      nextField = editableFields[fieldIndex + 1];
    } else if (direction === "down" && currentIndex < data.length - 1) {
      nextRowId = data[currentIndex + 1].id;
    }

    if (direction === "stay") {
      setEditingCell(null);
    } else {
      setEditingCell({ rowId: nextRowId, field: nextField });
    }
  }, [editingCell, drafts, data, editableFields, onSave]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!editingCell) return;

      switch (e.key) {
        case "Enter":
          e.preventDefault();
          saveAndMove("down");
          break;
        case "ArrowDown":
          e.preventDefault();
          saveAndMove("down");
          break;
        case "ArrowUp":
          e.preventDefault();
          saveAndMove("up");
          break;
        case "Tab":
          e.preventDefault();
          saveAndMove("right");
          break;
        case "Escape":
          e.preventDefault();
          cancelEdit();
          break;
      }
    },
    [editingCell, saveAndMove, cancelEdit]
  );

  const getDraftValue = useCallback((rowId: string, field: string) => {
    return drafts[rowId]?.[field];
  }, [drafts]);

  const isDirty = useCallback((rowId: string) => {
    return !!drafts[rowId];
  }, [drafts]);

  return {
    editingCell,
    startEdit,
    cancelEdit,
    updateDraft,
    handleKeyDown,
    getDraftValue,
    isDirty,
  };
}
