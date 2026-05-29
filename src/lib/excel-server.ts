import ExcelJS from "exceljs";

/** ExcelJS 支援嵌入的圖片格式 */
export type SupportedExtension = "png" | "jpeg" | "gif";

export type EmbeddableImage = {
  buffer: Buffer;
  extension: SupportedExtension;
};

/**
 * 將圖片來源解析為可嵌入 Excel 的 Buffer。
 * 支援：
 *  - base64 data URL（直接解碼，不需網路）
 *  - http/https 公開網址（server 端 fetch）
 * 不支援 / 失敗時回傳 null（呼叫端應跳過該圖片，不可中斷整體匯出）。
 *  - 本機相對路徑（例如 /uploads/...）在 Vercel 上無法 fetch，會回傳 null。
 *  - WebP 沒有轉檔套件，先跳過。
 */
export async function resolveImage(rawUrl: string | null | undefined): Promise<EmbeddableImage | null> {
  if (!rawUrl) return null;
  const url = rawUrl.trim();
  if (!url) return null;

  try {
    // 1) base64 data URL
    if (url.startsWith("data:")) {
      const match = url.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
      if (!match) return null;
      const mime = match[1].toLowerCase();
      const ext = mimeToExtension(mime);
      if (!ext) return null;
      const buffer = Buffer.from(match[2], "base64");
      if (buffer.length === 0) return null;
      return { buffer, extension: ext };
    }

    // 2) 公開 http/https 網址
    if (url.startsWith("http://") || url.startsWith("https://")) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      let res: Response;
      try {
        res = await fetch(url, { signal: controller.signal });
      } finally {
        clearTimeout(timeout);
      }
      if (!res.ok) return null;
      const contentType = (res.headers.get("content-type") || "").toLowerCase();
      let ext = mimeToExtension(contentType);
      // content-type 不明時，嘗試從副檔名推斷
      if (!ext) ext = extensionFromUrl(url);
      if (!ext) return null;
      const arrayBuffer = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      if (buffer.length === 0) return null;
      return { buffer, extension: ext };
    }

    // 3) 其他（相對路徑 /uploads/... 等）→ server 無法 fetch，跳過
    return null;
  } catch {
    // fetch 失敗、逾時、格式錯誤等一律跳過
    return null;
  }
}

function mimeToExtension(mime: string): SupportedExtension | null {
  if (mime.includes("png")) return "png";
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpeg";
  if (mime.includes("gif")) return "gif";
  // webp / svg / 其他 → 不支援
  return null;
}

function extensionFromUrl(url: string): SupportedExtension | null {
  const clean = url.split("?")[0].split("#")[0].toLowerCase();
  if (clean.endsWith(".png")) return "png";
  if (clean.endsWith(".jpg") || clean.endsWith(".jpeg")) return "jpeg";
  if (clean.endsWith(".gif")) return "gif";
  return null;
}

export type ServerExcelColumn<T> = {
  header: string;
  /** 取得儲存格純文字值 */
  get?: (row: T) => string | number | null | undefined;
  /** 標記為圖片欄位：使用 imageUrlGet 取得圖片來源並嵌入 */
  isImage?: boolean;
  imageUrlGet?: (row: T) => string | null | undefined;
  width?: number;
};

/**
 * 共用的 server 端 Excel 產生器：保留原本欄位與資料，並把圖片真正嵌入 .xlsx。
 * 回傳可直接作為 HTTP response body 的 Buffer。
 */
export async function buildExcelWithImages<T>(
  sheetName: string,
  rows: T[],
  columns: ServerExcelColumn<T>[],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(sheetName);

  // 標題列
  worksheet.columns = columns.map((c) => ({
    header: c.header,
    key: c.header,
    width: c.width ?? (c.isImage ? 14 : 18),
  }));
  worksheet.getRow(1).font = { bold: true };

  const imageColIndexes = columns
    .map((c, idx) => (c.isImage ? idx : -1))
    .filter((idx) => idx !== -1);
  const hasImage = imageColIndexes.length > 0;

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    const excelRowNumber = r + 2; // 第 1 列為標題

    // 寫入文字欄位（圖片欄位留空，由 addImage 疊上）
    const rowValues: Record<string, any> = {};
    columns.forEach((c) => {
      if (c.isImage) {
        rowValues[c.header] = "";
      } else {
        const v = c.get ? c.get(row) : "";
        rowValues[c.header] = v ?? "";
      }
    });
    const excelRow = worksheet.getRow(excelRowNumber);
    excelRow.values = rowValues;

    // 嵌入圖片
    if (hasImage) {
      excelRow.height = 64; // 約 85px，容納縮圖
      for (const colIdx of imageColIndexes) {
        const col = columns[colIdx];
        const src = col.imageUrlGet ? col.imageUrlGet(row) : undefined;
        const image = await resolveImage(src);
        if (!image) continue; // 失敗/不支援 → 跳過，不中斷
        try {
          const imageId = workbook.addImage({
            buffer: image.buffer as any,
            extension: image.extension,
          });
          worksheet.addImage(imageId, {
            tl: { col: colIdx + 0.15, row: excelRowNumber - 1 + 0.1 } as any,
            ext: { width: 80, height: 80 },
          });
        } catch {
          // addImage 失敗也跳過
          continue;
        }
      }
    }
    excelRow.commit?.();
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
