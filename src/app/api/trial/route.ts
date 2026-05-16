import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const TRIAL_DAYS = 2;

export async function GET() {
  // 檢查是否已付款
  const paidRow = await prisma.systemSetting.findUnique({ where: { key: "trial_paid" } });
  if (paidRow?.value === "1") {
    return NextResponse.json({ status: "paid" });
  }

  // 檢查試用期起始時間
  let startRow = await prisma.systemSetting.findUnique({ where: { key: "trial_start" } });
  if (!startRow) {
    // 首次使用，記錄起始時間
    startRow = await prisma.systemSetting.create({
      data: { key: "trial_start", value: String(Date.now()) },
    });
  }

  const startTs = Number(startRow.value);
  const expireTs = startTs + TRIAL_DAYS * 24 * 60 * 60 * 1000;
  const now = Date.now();

  if (now >= expireTs) {
    return NextResponse.json({ status: "expired" });
  }

  return NextResponse.json({ status: "trial", remainMs: expireTs - now });
}
