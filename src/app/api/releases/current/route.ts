import { NextResponse } from "next/server";
import { signOfflineLease } from "@/lib/license";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IMAGE = "ghcr.io/erin20080306/erp-inventory-management-copy:latest";

export async function GET() {
  if (process.env.LOCAL_LICENSE_MODE === "true") return NextResponse.json({ error: "本機主機不簽發中央版本" }, { status: 404 });
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + 15 * 60_000);
  const candidate = String(process.env.VERCEL_GIT_COMMIT_SHA || process.env.ERIN_RELEASE_SHA || "development").trim();
  const version = /^(?:[a-f0-9]{7,64}|development)$/i.test(candidate) ? candidate : "development";
  const release = signOfflineLease({
    type: "ERIN_ERP_HOST_RELEASE_V1",
    version,
    image: IMAGE,
    publishedAt: issuedAt.toISOString(),
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  });
  return NextResponse.json({ release }, { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=120" } });
}
