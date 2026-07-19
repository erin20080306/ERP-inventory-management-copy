"use client";

import { useEffect } from "react";
import { toast } from "sonner";

type KitchenItemStatus = "PREPARING" | "READY" | "SERVED";
type RestaurantRequestBody = {
  action?: string;
  status?: KitchenItemStatus;
};

function isKitchenPrintUrl(value: string) {
  try {
    const url = new URL(value, window.location.origin);
    return url.origin === window.location.origin && url.pathname.startsWith("/print/kitchen/");
  } catch {
    return false;
  }
}

function printKitchenTicketInPlace(value: string) {
  const url = new URL(value, window.location.origin);
  url.searchParams.set("embedded", "1");

  const frame = document.createElement("iframe");
  frame.title = "廚房單列印";
  frame.src = url.toString();
  frame.setAttribute("aria-hidden", "true");
  Object.assign(frame.style, {
    position: "fixed",
    right: "0",
    bottom: "0",
    width: "1px",
    height: "1px",
    border: "0",
    opacity: "0",
    pointerEvents: "none",
  });

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    frame.remove();
  };

  frame.addEventListener("load", () => {
    const printWindow = frame.contentWindow;
    if (!printWindow) {
      cleanup();
      toast.error("無法啟動廚房單列印");
      return;
    }

    printWindow.addEventListener("afterprint", cleanup, { once: true });
    window.setTimeout(() => {
      try {
        printWindow.focus();
        printWindow.print();
      } catch {
        cleanup();
        toast.error("無法啟動廚房單列印");
      }
    }, 150);
  }, { once: true });

  document.body.appendChild(frame);
  window.setTimeout(cleanup, 60_000);
}

function kitchenStatusMessage(status: KitchenItemStatus) {
  if (status === "PREPARING") return "已開始製作餐點";
  if (status === "READY") return "餐點已完成，等待出餐";
  return "餐點已標記為出餐完成";
}

export function RestaurantEnhancements() {
  useEffect(() => {
    const originalOpen = window.open.bind(window);
    const originalFetch = window.fetch.bind(window);

    const enhancedOpen = ((url?: string | URL, target?: string, features?: string) => {
      const href = url instanceof URL ? url.toString() : url ?? "";

      if (href === "about:blank" && target === "_blank") {
        let closed = false;
        const deferredLocation = {
          get href() {
            return "about:blank";
          },
          set href(nextValue: string) {
            if (closed) return;
            if (isKitchenPrintUrl(nextValue)) {
              printKitchenTicketInPlace(nextValue);
              return;
            }
            originalOpen(nextValue, target, features);
          },
        } as Location;

        return {
          opener: null,
          close: () => { closed = true; },
          location: deferredLocation,
        } as unknown as Window;
      }

      if (isKitchenPrintUrl(href)) {
        printKitchenTicketInPlace(href);
        return null;
      }

      return originalOpen(href || undefined, target, features);
    }) as typeof window.open;

    const enhancedFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      let requestBody: RestaurantRequestBody | null = null;
      const requestUrl = typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

      if (requestUrl.includes("/api/pos/restaurant") && init?.method?.toUpperCase() === "POST" && typeof init.body === "string") {
        try {
          requestBody = JSON.parse(init.body) as RestaurantRequestBody;
        } catch {
          requestBody = null;
        }
      }

      const response = await originalFetch(input, init);
      if (response.ok && requestBody?.action === "SET_ITEM_STATUS" && requestBody.status) {
        toast.success(kitchenStatusMessage(requestBody.status));
      }
      return response;
    }) as typeof window.fetch;

    const handleOpenTableClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const button = target.closest("button[data-shortcut='new']");
      if (button?.textContent?.includes("開桌")) toast.info("正在開桌…");
    };

    window.open = enhancedOpen;
    window.fetch = enhancedFetch;
    document.addEventListener("click", handleOpenTableClick, true);

    return () => {
      window.open = originalOpen;
      window.fetch = originalFetch;
      document.removeEventListener("click", handleOpenTableClick, true);
    };
  }, []);

  return null;
}
