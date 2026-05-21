import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requireAuth, audit, nextNumber } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { buildClosingDraft, autoCreateJournal } from "@/lib/auto-journal";

export const POST = apiHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (!session.user.isSuperAdmin) throw new Error("僅限超級管理員");
  
  const body = await req.json();
  const { periodEnd, isYearEnd } = body as any;
  if (!periodEnd) throw new Error("請提供結帳日期");
  
  const tenantId = session.user.tenantId;
  
  // 檢查是否已經結帳過（透過 summary 識別）
  const existingClosing = await prisma.journalEntry.findFirst({
    where: {
      tenantId,
      entryDate: periodEnd,
      summary: { contains: isYearEnd ? "年結" : "月結" },
    },
  });
  if (existingClosing) {
    throw new Error(`該期間已結帳（傳票編號：${existingClosing.number}）`);
  }

  // 建立結帳傳票
  const draft = await buildClosingDraft(tenantId, periodEnd, isYearEnd);
  const entry = await autoCreateJournal(tenantId, draft, session.user.id);
  
  if (!entry) {
    throw new Error("建立結帳傳票失敗");
  }

  await audit({ 
    userId: session.user.id, 
    action: "close_period", 
    module: "accounting", 
    refId: entry.id, 
    detail: `${isYearEnd ? "年結" : "月結"} ${periodEnd}` 
  });

  return NextResponse.json({ 
    ok: true, 
    entry,
    summary: draft.summary,
  });
});
