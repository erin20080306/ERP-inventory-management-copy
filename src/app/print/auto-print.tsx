"use client";
import { useEffect } from "react";

export function AutoPrint() {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="no-print">
      <button onClick={() => window.print()}>🖨️ 列印 / 另存 PDF</button>
    </div>
  );
}
