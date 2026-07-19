import { NextResponse } from "next/server";
import { currentLicensePublicKeyB64 } from "@/lib/ed25519-signature";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return new NextResponse(currentLicensePublicKeyB64(), {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    return new NextResponse(error instanceof Error ? error.message : "授權公鑰尚未設定", {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
