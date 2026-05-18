"use client";
import { useEffect, useState } from "react";

type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function PWAInstall() {
  const [evt, setEvt] = useState<BIPEvent | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [platform, setPlatform] = useState<"android" | "ios" | "other">("other");

  useEffect(() => {
    if (typeof window === "undefined") return;

    // 偵測平台
    const ua = navigator.userAgent;
    if (/android/i.test(ua)) setPlatform("android");
    else if (/iphone|ipad|ipod/i.test(ua)) setPlatform("ios");

    // 已安裝（standalone 模式）就不顯示
    const isStandalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true;
    if (isStandalone) {
      setInstalled(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setEvt(e as BIPEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", () => setInstalled(true));
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (installed) return null;

  async function install() {
    if (evt) {
      await evt.prompt();
      const r = await evt.userChoice;
      if (r.outcome === "accepted") setInstalled(true);
      setEvt(null);
    } else {
      // 沒有 beforeinstallprompt（舊 Android / iOS / 其他瀏覽器）→ 顯示手動說明
      setShowHelp(true);
    }
  }

  return (
    <>
      <button
        onClick={install}
        style={{
          padding: "10px 16px",
          background: "linear-gradient(135deg,#4f46e5,#10b981)",
          color: "white",
          border: "none",
          borderRadius: 10,
          fontSize: 14,
          fontWeight: 600,
          cursor: "pointer",
          boxShadow: "0 2px 10px rgba(79,70,229,0.35)",
        }}
      >
        📱 安裝 APP 到桌面
      </button>

      {showHelp && (
        <div
          onClick={() => setShowHelp(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "white",
              color: "#0f172a",
              padding: 24,
              borderRadius: 16,
              maxWidth: 420,
              width: "100%",
              boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
            }}
          >
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>
              如何安裝 APP 到手機桌面
            </h3>

            {platform === "android" && (
              <div style={{ fontSize: 14, lineHeight: 1.7 }}>
                <p style={{ fontWeight: 600, marginBottom: 8 }}>Android（Chrome 或 Edge）：</p>
                <ol style={{ paddingLeft: 20 }}>
                  <li>點瀏覽器右上角 <b>⋮ 選單</b></li>
                  <li>選擇 <b>「安裝應用程式」</b> 或 <b>「加到主畫面」</b></li>
                  <li>確認後桌面會出現 ERP 系統圖示</li>
                </ol>
                <p style={{ fontSize: 12, color: "#666", marginTop: 12 }}>
                  舊版 Chrome 可能顯示為「新增至主畫面」
                </p>
              </div>
            )}

            {platform === "ios" && (
              <div style={{ fontSize: 14, lineHeight: 1.7 }}>
                <p style={{ fontWeight: 600, marginBottom: 8 }}>iPhone / iPad（請用 Safari 瀏覽器）：</p>
                <ol style={{ paddingLeft: 20 }}>
                  <li>點底部中間的 <b>分享按鈕 ⬆️</b></li>
                  <li>下拉找到 <b>「加入主畫面」</b></li>
                  <li>右上角點 <b>「新增」</b> 完成</li>
                </ol>
                <p style={{ fontSize: 12, color: "#666", marginTop: 12 }}>
                  iOS 必須用 Safari 安裝，Chrome 無法安裝 PWA
                </p>
              </div>
            )}

            {platform === "other" && (
              <div style={{ fontSize: 14, lineHeight: 1.7 }}>
                <p>請使用支援 PWA 的瀏覽器（Chrome、Edge、Safari）開啟此網站，然後從瀏覽器選單選擇「安裝應用程式」或「加到主畫面」。</p>
              </div>
            )}

            <button
              onClick={() => setShowHelp(false)}
              style={{
                marginTop: 16,
                width: "100%",
                padding: "10px",
                background: "#4f46e5",
                color: "white",
                border: "none",
                borderRadius: 8,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              我知道了
            </button>
          </div>
        </div>
      )}
    </>
  );
}
