"use client";
import { useEffect } from "react";

const VERSION_CHECK_INTERVAL_MS = 60_000;

export function SWRegister({ initialVersion }: { initialVersion: string }) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (process.env.NODE_ENV !== "production") return;
    let active = true;
    let checking = false;
    let loadedVersion = initialVersion;

    const checkRuntimeVersion = async () => {
      if (!active || checking) return;
      checking = true;
      try {
        const response = await fetch("/api/runtime-mode", {
          cache: "no-store",
          headers: { "Cache-Control": "no-cache" },
        });
        if (!response.ok) return;
        const result = await response.json() as { appVersion?: string };
        const nextVersion = String(result.appVersion || "").trim();
        if (!nextVersion || nextVersion === "development") return;
        if (loadedVersion !== "development" && nextVersion !== loadedVersion) {
          if ("serviceWorker" in navigator) {
            const registration = await navigator.serviceWorker.getRegistration();
            await registration?.update().catch(() => undefined);
          }
          window.location.reload();
          return;
        }
        loadedVersion = nextVersion;
      } catch {
        // 離線或主機更新重啟中時保留目前頁面，恢復連線後會再次檢查。
      } finally {
        checking = false;
      }
    };

    const checkWhenVisible = () => {
      if (document.visibilityState === "visible") void checkRuntimeVersion();
    };

    const onLoad = () => {
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.register("/sw.js").catch(() => {
          // 忽略註冊失敗
        });
      }
      void checkRuntimeVersion();
    };
    if (document.readyState === "complete") onLoad();
    else window.addEventListener("load", onLoad, { once: true });

    const interval = window.setInterval(() => void checkRuntimeVersion(), VERSION_CHECK_INTERVAL_MS);
    window.addEventListener("focus", checkWhenVisible);
    document.addEventListener("visibilitychange", checkWhenVisible);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("load", onLoad);
      window.removeEventListener("focus", checkWhenVisible);
      document.removeEventListener("visibilitychange", checkWhenVisible);
    };
  }, [initialVersion]);
  return null;
}
