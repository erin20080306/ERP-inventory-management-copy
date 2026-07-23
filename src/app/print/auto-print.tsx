"use client";
import { useEffect } from "react";

export function AutoPrint({ auto = true }: { auto?: boolean }) {
  useEffect(() => {
    if (!auto) return;
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, [auto]);

  function handleClose() {
    // 嘗試關閉視窗（若是 window.open 開啟的）
    if (window.history.length > 1) {
      window.history.back();
    } else {
      try {
        window.close();
      } catch {}
      // 後援：導回主系統
      window.location.href = "/reports";
    }
  }

  return (
    <div
      className="no-print"
      style={{
        position: "fixed",
        top: 12,
        right: 12,
        display: "flex",
        gap: 8,
        zIndex: 9999,
      }}
    >
      <button
        onClick={handleClose}
        style={{
          padding: "8px 14px",
          background: "#ef4444",
          color: "white",
          border: "none",
          borderRadius: 8,
          fontSize: 14,
          fontWeight: 600,
          cursor: "pointer",
          boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
        }}
      >
        ✕ 關閉
      </button>
      <button
        onClick={() => window.print()}
        title="送至實體印表機列印"
        style={{
          padding: "8px 14px",
          background: "#4f46e5",
          color: "white",
          border: "none",
          borderRadius: 8,
          fontSize: 14,
          fontWeight: 600,
          cursor: "pointer",
          boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
        }}
      >
        🖨️ 列印
      </button>
      <button
        onClick={() => window.print()}
        title="在列印對話框選「另存為 PDF」即可下載"
        style={{
          padding: "8px 14px",
          background: "#10b981",
          color: "white",
          border: "none",
          borderRadius: 8,
          fontSize: 14,
          fontWeight: 600,
          cursor: "pointer",
          boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
        }}
      >
        📄 下載 PDF
      </button>
    </div>
  );
}
