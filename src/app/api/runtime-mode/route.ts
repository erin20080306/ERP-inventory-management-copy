import { NextResponse } from "next/server";
import { currentRuntimeVersion } from "@/lib/runtime-version";

export const dynamic = "force-dynamic";

export async function GET() {
  const localLicenseMode = process.env.LOCAL_LICENSE_MODE === "true";
  return NextResponse.json(
    {
      localLicenseMode,
      demoLoginEnabled: !localLicenseMode,
      appVersion: currentRuntimeVersion(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
