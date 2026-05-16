import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST() {
  await prisma.systemSetting.upsert({
    where: { key: "trial_paid" },
    update: { value: "1" },
    create: { key: "trial_paid", value: "1" },
  });
  return NextResponse.json({ status: "paid" });
}
