import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, requireTenantId, audit } from "@/lib/api";
import { prisma } from "@/lib/prisma";

const TYPE_MAP: Record<string, string> = {
  資產: "ASSET", asset: "ASSET", ASSET: "ASSET",
  負債: "LIABILITY", liability: "LIABILITY", LIABILITY: "LIABILITY",
  權益: "EQUITY", 業主權益: "EQUITY", 股東權益: "EQUITY", equity: "EQUITY", EQUITY: "EQUITY",
  收入: "REVENUE", 營業收入: "REVENUE", revenue: "REVENUE", REVENUE: "REVENUE",
  成本: "COST", 營業成本: "COST", cost: "COST", COST: "COST",
  費用: "EXPENSE", 營業費用: "EXPENSE", expense: "EXPENSE", EXPENSE: "EXPENSE",
};

// 依代碼前綴自動辨識類型 (備援)
function guessType(code: string): string {
  const c = code.trim();
  if (c.startsWith("1")) return "ASSET";
  if (c.startsWith("2")) return "LIABILITY";
  if (c.startsWith("3")) return "EQUITY";
  if (c.startsWith("4")) return "REVENUE";
  if (c.startsWith("5")) return "COST";
  if (c.startsWith("6") || c.startsWith("7")) return "EXPENSE";
  return "ASSET";
}

function parseCSV(text: string): string[][] {
  // 簡易 CSV parser，支援雙引號與逗號跳脫
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQ = false;
  // 移除 BOM
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') inQ = false;
      else field += ch;
    } else {
      if (ch === '"') inQ = true;
      else if (ch === ",") { cur.push(field); field = ""; }
      else if (ch === "\n") { cur.push(field); rows.push(cur); cur = []; field = ""; }
      else if (ch === "\r") { /* skip */ }
      else field += ch;
    }
  }
  if (field.length > 0 || cur.length > 0) { cur.push(field); rows.push(cur); }
  return rows.filter((r) => r.some((c) => c.trim().length > 0));
}

export const POST = apiHandler(async (req: NextRequest) => {
  const session = await requirePermission("accounting.create");
  const tenantId = await requireTenantId();
  const body = await req.json();
  const text: string = body.csv || "";
  if (!text.trim()) throw new Error("CSV 內容為空");

  const rows = parseCSV(text);
  if (rows.length < 1) throw new Error("CSV 格式錯誤");

  // 偵測標題列：若第一列含「代碼/編號/名稱/類型」等字樣，視為 header
  const first = rows[0].map((c) => c.trim().toLowerCase());
  const isHeader = first.some((c) =>
    ["代碼", "編號", "code", "名稱", "name", "類型", "type"].some((k) => c.includes(k.toLowerCase()))
  );
  const data = isHeader ? rows.slice(1) : rows;

  let created = 0;
  let updated = 0;
  const errors: string[] = [];
  for (let i = 0; i < data.length; i++) {
    const r = data[i];
    const code = (r[0] ?? "").trim();
    const name = (r[1] ?? "").trim();
    const typeRaw = (r[2] ?? "").trim();
    if (!code || !name) {
      errors.push(`第 ${i + (isHeader ? 2 : 1)} 列：代碼或名稱為空，已略過`);
      continue;
    }
    const type = TYPE_MAP[typeRaw] || guessType(code);
    const existed = await prisma.chartOfAccount.findUnique({ where: { tenantId_code: { tenantId, code } } });
    await prisma.chartOfAccount.upsert({
      where: { tenantId_code: { tenantId, code } },
      update: { name, type: type as any },
      create: { tenantId, code, name, type: type as any },
    });
    if (existed) updated++;
    else created++;
  }
  await audit({ userId: session.user.id, action: "import", module: "accounting", detail: `新增 ${created}, 更新 ${updated}` });
  return NextResponse.json({ created, updated, errors, total: data.length });
});
