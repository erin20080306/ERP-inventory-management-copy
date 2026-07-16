import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { refreshLocalLicenseLease, resolveLocalLicenseAccess } from "@/lib/license";
import { prisma } from "@/lib/prisma";
import { normalizeBusinessMode } from "@/lib/product-editions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function validInstallerToken(provided: string | null) {
  const expected = process.env.LOCAL_INSTALLER_TOKEN;
  if (!expected || expected.length < 32 || !provided) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(provided);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(req: NextRequest) {
  if (process.env.LOCAL_LICENSE_MODE !== "true") return NextResponse.json({ error: "此端點只供本機安裝驗收" }, { status: 404 });
  if (!validInstallerToken(req.headers.get("x-erin-installer-token"))) {
    return NextResponse.json({ error: "安裝驗證權杖無效" }, { status: 403 });
  }

  const tenant = await prisma.tenant.findFirst({
    where: { isInternal: false },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!tenant) return NextResponse.json({ error: "本機公司資料尚未建立" }, { status: 503 });

  try {
    await refreshLocalLicenseLease(tenant.id);
    const access = await resolveLocalLicenseAccess(tenant.id);
    const synced = await prisma.tenant.findUnique({
      where: { id: tenant.id },
      select: { name: true, businessMode: true },
    });
    if (!access.allowed || !synced) {
      return NextResponse.json({ error: access.reason || "本機授權不可用", access }, { status: 402 });
    }
    return NextResponse.json({
      ok: true,
      companyName: synced.name,
      businessMode: normalizeBusinessMode(synced.businessMode),
      leaseExpiresAt: access.expiresAt,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "本機授權驗證失敗" }, { status: 502 });
  }
}
