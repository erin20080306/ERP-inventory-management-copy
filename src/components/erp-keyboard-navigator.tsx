"use client";

import { useEffect, useState } from "react";
import { Keyboard } from "lucide-react";

const FIELD_SELECTOR = [
  "input:not([disabled]):not([type=hidden])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[contenteditable=true]",
].join(",");

function visible(element: HTMLElement) {
  const style = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
}

function scopeFields(target: HTMLElement) {
  const scope = target.closest<HTMLElement>("[role=dialog], form, table, [data-erp-keyboard-scope]")
    ?? document.querySelector<HTMLElement>("main[data-erp-keyboard-scope]");
  return Array.from(scope?.querySelectorAll<HTMLElement>(FIELD_SELECTOR) ?? []).filter(visible);
}

function clickVisibleAction(shortcut: string, fallbackTexts: string[]) {
  const explicit = Array.from(document.querySelectorAll<HTMLElement>(`[data-shortcut="${shortcut}"]`)).find(visible);
  if (explicit) return explicit.click();
  const buttons = Array.from(document.querySelectorAll<HTMLElement>("[role=dialog] button, main button")).filter(visible);
  const fallback = buttons.find((button) => fallbackTexts.some((text) => button.textContent?.trim().includes(text)));
  fallback?.click();
}

export function ErpKeyboardNavigator() {
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (!target) return;

      if (event.key === "F1") {
        event.preventDefault();
        setShowHelp((value) => !value);
        return;
      }
      if (event.key === "F2") {
        const search = Array.from(document.querySelectorAll<HTMLInputElement>(
          'main input[type="search"], main input[placeholder*="搜尋"], main input[placeholder*="查詢"], main input[placeholder*="關鍵字"]',
        )).find(visible);
        if (search) {
          event.preventDefault();
          search.focus();
          search.select();
        }
        return;
      }
      if (event.key === "F4" || (event.altKey && event.key.toLowerCase() === "n")) {
        event.preventDefault();
        clickVisibleAction("new", ["新增", "建立", "開桌"]);
        return;
      }
      if (event.key === "F8" || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s")) {
        event.preventDefault();
        clickVisibleAction("save", ["儲存", "確認建立", "送出"]);
        return;
      }
      if (event.key === "Escape" && target.matches(FIELD_SELECTOR)) {
        target.blur();
        return;
      }

      if (!target.matches(FIELD_SELECTOR) || target instanceof HTMLTextAreaElement || target.isContentEditable) return;
      if (target instanceof HTMLSelectElement && (event.key === "ArrowUp" || event.key === "ArrowDown")) return;
      const fields = scopeFields(target);
      const index = fields.indexOf(target);
      if (index < 0) return;
      const direction = event.key === "ArrowDown" || (event.key === "Enter" && !event.shiftKey)
        ? 1
        : event.key === "ArrowUp" || (event.key === "Enter" && event.shiftKey)
          ? -1
          : 0;
      if (!direction) return;
      const next = fields[index + direction];
      if (!next) return;
      event.preventDefault();
      next.focus();
      if (next instanceof HTMLInputElement && next.type !== "date") next.select();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setShowHelp((value) => !value)}
        className="hidden lg:inline-flex h-8 items-center gap-1.5 rounded-md border bg-background px-2 text-[11px] text-muted-foreground hover:text-foreground"
        aria-label="顯示鍵盤快捷鍵"
      >
        <Keyboard className="h-3.5 w-3.5" />F1 快捷鍵
      </button>
      {showHelp && (
        <div className="fixed right-5 top-20 z-[100] w-80 rounded-xl border bg-popover p-4 text-sm shadow-2xl" role="dialog" aria-label="鍵盤快捷鍵">
          <div className="font-bold">單據鍵盤操作</div>
          <div className="mt-3 grid grid-cols-[95px_1fr] gap-y-2 text-xs">
            <kbd>↑ / ↓</kbd><span>上一欄／下一欄</span>
            <kbd>Enter</kbd><span>下一欄，Shift＋Enter 回上一欄</span>
            <kbd>F2</kbd><span>跳到搜尋欄</span>
            <kbd>F4 / Alt＋N</kbd><span>新增單據或開桌</span>
            <kbd>F8 / Ctrl＋S</kbd><span>儲存目前表單</span>
            <kbd>Esc</kbd><span>離開目前欄位</span>
          </div>
          <p className="mt-3 text-[11px] leading-5 text-muted-foreground">下拉選單與多行備註保留原生方向鍵；各單據既有的表格快捷鍵優先。</p>
        </div>
      )}
    </>
  );
}
