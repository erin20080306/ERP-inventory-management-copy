import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({ error: "授權不能重置試用期，請使用公司授權撤銷功能" }, { status: 410 });
}
