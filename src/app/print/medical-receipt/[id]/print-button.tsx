"use client";

import { Printer } from "lucide-react";

export function PrintButton() {
  return <button onClick={() => window.print()} className="print:hidden inline-flex items-center gap-2 rounded-full bg-stone-900 px-5 py-2.5 text-sm font-bold text-white"><Printer className="h-4 w-4" />列印醫療收據</button>;
}
