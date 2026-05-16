import * as XLSX from "xlsx";

export type ExcelColumn<T> = {
  key: string;
  title: string;
  get?: (row: T) => any;
};

/** 匯出資料為 .xlsx */
export function downloadExcel<T = any>(filename: string, sheetName: string, rows: T[], columns: ExcelColumn<T>[]) {
  const data = rows.map((r: any) => {
    const o: Record<string, any> = {};
    columns.forEach((c) => {
      o[c.title] = c.get ? c.get(r) : r[c.key];
    });
    return o;
  });
  const ws = XLSX.utils.json_to_sheet(data, { header: columns.map((c) => c.title) });
  // 自動欄寬
  const colWidths = columns.map((c) => ({
    wch: Math.max(c.title.length * 2, ...data.map((d: any) => String(d[c.title] ?? "").length)) + 2,
  }));
  ws["!cols"] = colWidths;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, `${filename}-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

/** 從 .xlsx/.xls/.csv 讀取為 JSON 物件陣列 */
export async function readExcelFile(file: File): Promise<Record<string, any>[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { defval: "" });
}

/** 下載 Excel 範本 */
export function downloadExcelTemplate(filename: string, sheetName: string, headers: string[], example?: Record<string, any>[]) {
  const data = example ?? [headers.reduce((o, h) => ({ ...o, [h]: "" }), {} as Record<string, any>)];
  const ws = XLSX.utils.json_to_sheet(data, { header: headers });
  ws["!cols"] = headers.map((h) => ({ wch: Math.max(h.length * 2, 12) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, `${filename}-template.xlsx`);
}
