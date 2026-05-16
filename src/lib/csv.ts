// CSV 匯出工具
export function toCSV(rows: any[], columns: { key: string; title: string; get?: (r: any) => any }[]): string {
  const escape = (v: any) => {
    if (v === null || v === undefined) return "";
    const s = String(v).replace(/"/g, '""');
    return /[",\n\r]/.test(s) ? `"${s}"` : s;
  };
  const header = columns.map((c) => escape(c.title)).join(",");
  const body = rows
    .map((r) => columns.map((c) => escape(c.get ? c.get(r) : r[c.key])).join(","))
    .join("\n");
  // BOM 讓 Excel 直接顯示中文
  return "\uFEFF" + header + "\n" + body;
}

export function downloadCSV(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
