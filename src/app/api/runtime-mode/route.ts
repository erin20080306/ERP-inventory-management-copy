import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const localLicenseMode = process.env.LOCAL_LICENSE_MODE === "true";
  return NextResponse.json(
    {
      localLicenseMode,
      demoLoginEnabled: !localLicenseMode,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
