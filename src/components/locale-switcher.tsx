"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Languages, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { LOCALES, LOCALE_LABELS, normalizeLocale, type Locale } from "@/i18n/config";
import { isPublicLocalePath, localizePublicPath, splitLocalePath } from "@/i18n/routing";

export function LocaleSwitcher({ compact = false }: { compact?: boolean }) {
  const active = normalizeLocale(useLocale());
  const t = useTranslations("locale");
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const select = (next: Locale) => {
    setOpen(false);
    if (next === active) return;

    startTransition(async () => {
      try {
        const response = await fetch("/api/me/locale", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ locale: next }),
        });
        if (!response.ok) throw new Error("save failed");
        const result = (await response.json()) as { persisted?: boolean };
        if (result.persisted) toast.success(t("savedToProfile"));
      } catch {
        toast.error(t("saveFailed"));
      }

      // 對外官網／商城的語言寫在網址上，必須換頁才能讓搜尋引擎與分享連結一致。
      const basePath = splitLocalePath(pathname)?.pathname ?? pathname;
      if (isPublicLocalePath(basePath)) {
        router.replace(localizePublicPath(basePath, next));
      }
      router.refresh();
    });
  };

  return (
    <div ref={containerRef} className="relative">
      <Button
        variant="ghost"
        size={compact ? "icon" : "sm"}
        onClick={() => setOpen((value) => !value)}
        disabled={pending}
        aria-label={t("switchLabel")}
        title={`${t("current")}：${LOCALE_LABELS[active]}`}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Languages className="h-4 w-4" />
        {!compact && <span className="ml-1 text-xs font-medium">{active === "en" ? "EN" : "中"}</span>}
      </Button>

      {open && (
        <div
          role="menu"
          aria-label={t("switchLabel")}
          className="absolute right-0 z-50 mt-2 min-w-[10rem] overflow-hidden rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg"
        >
          {LOCALES.map((locale) => (
            <button
              key={locale}
              type="button"
              role="menuitemradio"
              aria-checked={locale === active}
              onClick={() => select(locale)}
              className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-sm transition hover:bg-muted"
            >
              <span>{LOCALE_LABELS[locale]}</span>
              {locale === active && <Check className="h-4 w-4 text-emerald-600" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
