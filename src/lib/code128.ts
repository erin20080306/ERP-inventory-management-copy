const CODE128_PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
] as const;

export type Code128SvgOptions = {
  height?: number;
  quietZone?: number;
};

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function normalizeCode128Value(value: string) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new Error("商品沒有可列印的條碼或 SKU");
  if (normalized.length > 80) throw new Error("條碼內容不可超過 80 個字元");
  if (!/^[\x20-\x7E]+$/.test(normalized)) {
    throw new Error("條碼只能使用英文字母、數字及一般半形符號");
  }
  return normalized;
}

export function code128BSvg(value: string, options: Code128SvgOptions = {}) {
  const normalized = normalizeCode128Value(value);
  const height = Math.max(24, Math.min(160, Number(options.height ?? 56)));
  const quietZone = Math.max(10, Math.min(40, Number(options.quietZone ?? 12)));
  const dataCodes = [...normalized].map((character) => character.charCodeAt(0) - 32);
  const checksum = (104 + dataCodes.reduce((sum, code, index) => sum + code * (index + 1), 0)) % 103;
  const codes = [104, ...dataCodes, checksum, 106];

  let x = quietZone;
  const bars: string[] = [];
  for (const code of codes) {
    const pattern = CODE128_PATTERNS[code];
    let drawBar = true;
    for (const widthText of pattern) {
      const width = Number(widthText);
      if (drawBar) bars.push(`<rect x="${x}" y="0" width="${width}" height="${height}" />`);
      x += width;
      drawBar = !drawBar;
    }
  }
  const totalWidth = x + quietZone;

  return `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Code 128 ${escapeXml(normalized)}" viewBox="0 0 ${totalWidth} ${height}" preserveAspectRatio="none" shape-rendering="crispEdges"><rect width="${totalWidth}" height="${height}" fill="white"/><g fill="black">${bars.join("")}</g></svg>`;
}
