import { NextResponse } from "next/server";

export async function GET() {
  const publicKeyB64 = process.env.LICENSE_ED25519_PUBLIC_KEY_B64;
  if (!publicKeyB64) return new NextResponse("授權公鑰尚未設定", { status: 503 });
  return new NextResponse(publicKeyB64, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
