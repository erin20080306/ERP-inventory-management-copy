import * as XLSX from "xlsx";

export type ExcelColumn<T> = {
  key: string;
  title: string;
  get?: (row: T) => any;
  isImage?: boolean; // 標記此欄位為圖片欄位
  isUrl?: boolean; // 標記此欄位為 URL 欄位，創建超連結
  urlGet?: (row: T) => string; // 獲取實際 URL（與顯示文字分開）
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
  
  // 處理 URL 欄位，創建超連結
  columns.forEach((c, colIndex) => {
    if (c.isUrl) {
      const colLetter = XLSX.utils.encode_col(colIndex);
      data.forEach((row: any, rowIndex) => {
        const cellAddress = `${colLetter}${rowIndex + 2}`; // +2 因為有標題行
        const cell = ws[cellAddress];
        if (cell && cell.v) {
          // 如果有 urlGet，使用它作為超連結目標，否則使用單元格值
          const targetUrl = c.urlGet ? c.urlGet(rows[rowIndex]) : cell.v;
          if (targetUrl) {
            cell.l = { Target: targetUrl, Tooltip: "點擊查看圖片" };
          }
        }
      });
    }
  });
  
  // 處理圖片欄位
  const imageColIndex = columns.findIndex((c) => c.isImage);
  if (imageColIndex !== -1) {
    // 設置圖片欄位的欄寬為固定大小
    const colWidths = columns.map((c, idx) => ({
      wch: c.isImage ? 15 : Math.max(c.title.length * 2, ...data.map((d: any) => String(d[c.title] ?? "").length)) + 2,
    }));
    ws["!cols"] = colWidths;
    
    // 嘗試添加圖片（需要在服務器端處理，因為瀏覽器端 XLSX 對圖片支持有限）
    // 這裡我們保留圖片 URL 在單元格中，用戶可以點擊查看
  } else {
    // 自動欄寬
    const colWidths = columns.map((c) => ({
      wch: Math.max(c.title.length * 2, ...data.map((d: any) => String(d[c.title] ?? "").length)) + 2,
    }));
    ws["!cols"] = colWidths;
  }
  
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
