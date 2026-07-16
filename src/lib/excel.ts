import ExcelJS from "exceljs";

export type ExcelColumn<T> = {
  key: string;
  title: string;
  get?: (row: T) => any;
  isImage?: boolean;
  isUrl?: boolean;
  urlGet?: (row: T) => string;
};

function triggerDownload(data: ArrayBuffer, filename: string) {
  const url = URL.createObjectURL(new Blob([data], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

/** 匯出資料為 .xlsx；使用 ExcelJS，避免已知無修補版本的 SheetJS 解析器。 */
export async function downloadExcel<T = any>(filename: string, sheetName: string, rows: T[], columns: ExcelColumn<T>[]) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName.slice(0, 31));
  sheet.columns = columns.map((column) => ({ header: column.title, key: column.key, width: Math.max(12, column.title.length * 2 + 2) }));
  rows.forEach((row: any) => {
    const values: Record<string, unknown> = {};
    columns.forEach((column) => { values[column.key] = column.get ? column.get(row) : row[column.key]; });
    const excelRow = sheet.addRow(values);
    columns.forEach((column, index) => {
      if (!column.isUrl) return;
      const target = column.urlGet ? column.urlGet(row) : String(values[column.key] ?? "");
      if (target) excelRow.getCell(index + 1).value = { text: String(values[column.key] ?? target), hyperlink: target, tooltip: "點擊開啟" };
    });
  });
  sheet.getRow(1).font = { bold: true };
  const buffer = await workbook.xlsx.writeBuffer();
  triggerDownload(buffer, `${filename}-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function cellValue(cell: ExcelJS.Cell) {
  const value = cell.value;
  if (value && typeof value === "object") {
    if ("result" in value) return value.result ?? "";
    if ("text" in value) return value.text ?? "";
    if ("richText" in value) return value.richText.map((item) => item.text).join("");
  }
  return value ?? "";
}

/** 從 .xlsx 讀取 JSON。CSV 另由既有 CSV 匯入流程處理。 */
export async function readExcelFile(file: File): Promise<Record<string, any>[]> {
  if (!file.name.toLowerCase().endsWith(".xlsx")) throw new Error("Excel 匯入僅接受 .xlsx；舊 .xls 請先另存為 .xlsx");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const sheet = workbook.worksheets[0];
  if (!sheet || sheet.rowCount < 1) return [];
  const headers: string[] = [];
  sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, column) => { headers[column] = String(cellValue(cell)).trim(); });
  const rows: Record<string, any>[] = [];
  for (let rowNo = 2; rowNo <= sheet.rowCount; rowNo++) {
    const row: Record<string, any> = {};
    let hasValue = false;
    headers.forEach((header, column) => {
      if (!header) return;
      const value = cellValue(sheet.getRow(rowNo).getCell(column));
      row[header] = value;
      if (value !== "" && value !== null) hasValue = true;
    });
    if (hasValue) rows.push(row);
  }
  return rows;
}

export async function downloadExcelTemplate(filename: string, sheetName: string, headers: string[], example?: Record<string, any>[]) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName.slice(0, 31));
  sheet.columns = headers.map((header, index) => ({ header, key: `c${index}`, width: Math.max(header.length * 2, 12) }));
  for (const row of example ?? []) sheet.addRow(Object.fromEntries(headers.map((header, index) => [`c${index}`, row[header] ?? ""])));
  sheet.getRow(1).font = { bold: true };
  const buffer = await workbook.xlsx.writeBuffer();
  triggerDownload(buffer, `${filename}-template.xlsx`);
}
