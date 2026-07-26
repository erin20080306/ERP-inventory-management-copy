import { NextResponse } from "next/server";
import { signOfflineLease } from "@/lib/license";
import { CURRENT_HOST_RELEASE } from "@/generated/current-host-release";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IMAGE_REPOSITORY = "ghcr.io/erin20080306/erp-inventory-management-copy";
const LEGACY_IMAGE = `${IMAGE_REPOSITORY}:latest`;
const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/i;

export async function GET() {
  if (process.env.LOCAL_LICENSE_MODE === "true") return NextResponse.json({ error: "本機主機不簽發中央版本" }, { status: 404 });
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + 15 * 60_000);
  const candidate = String(CURRENT_HOST_RELEASE.version || "development").trim();
  const version = /^(?:[a-f0-9]{7,64}|development)$/i.test(candidate) ? candidate : "development";
  const releaseMarker = CURRENT_HOST_RELEASE as typeof CURRENT_HOST_RELEASE & { digest?: string };
  const digestCandidate = String(releaseMarker.digest || "").trim().toLowerCase();
  const imageDigest = DIGEST_PATTERN.test(digestCandidate) ? digestCandidate : undefined;
  const release = signOfflineLease({
    type: "ERIN_ERP_HOST_RELEASE_V1",
    version,
    image: LEGACY_IMAGE,
    ...(imageDigest ? {
      imageDigest,
      immutableImage: `${IMAGE_REPOSITORY}@${imageDigest}`,
    } : {}),
    publishedAt: CURRENT_HOST_RELEASE.publishedAt,
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  });
  return NextResponse.json({ release }, { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=120" } });
}
