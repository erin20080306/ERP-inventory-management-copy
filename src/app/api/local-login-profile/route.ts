import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeBusinessMode } from "@/lib/product-editions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function readLicensedPrimaryEmail(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return "";
  const primaryAccount = (payload as Record<string, unknown>).primaryAccount;
  if (!primaryAccount || typeof primaryAccount !== "object" || Array.isArray(primaryAccount)) return "";
  const email = String((primaryAccount as Record<string, unknown>).email || "").trim().toLowerCase();
  return /^\S+@\S+\.\S+$/.test(email) ? email : "";
}

export async function GET() {
  if (process.env.LOCAL_LICENSE_MODE !== "true") {
    return NextResponse.json({ error: "此端點僅供已安裝的公司主機使用" }, { status: 404 });
  }

  const licensedLease = await prisma.offlineLicenseLease.findFirst({
    orderBy: [{ checkedAt: "desc" }, { id: "asc" }],
    select: {
      payload: true,
      tenant: {
        select: { id: true, name: true, businessMode: true, isInternal: true },
      },
    },
  });
  const tenant = licensedLease?.tenant && !licensedLease.tenant.isInternal
    ? licensedLease.tenant
    : await prisma.tenant.findFirst({
      where: { isInternal: false },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, businessMode: true, isInternal: true },
  });
  if (!tenant) return NextResponse.json({ error: "尚未完成租戶授權同步" }, { status: 503 });

  // 公司主機安裝時另建有一個本機備用管理員；它的密碼不是租戶註冊密碼。
  // 登入頁必須優先採用中央簽章租約指定並已同步的租戶帳號，避免帶錯備用帳號。
  const licensedPrimaryEmail = readLicensedPrimaryEmail(licensedLease?.payload);
  const licensedPrimaryAccount = licensedPrimaryEmail
    ? await prisma.user.findFirst({
        where: { tenantId: tenant.id, email: { equals: licensedPrimaryEmail, mode: "insensitive" }, isActive: true },
        select: { username: true, email: true, name: true },
      })
    : null;
  const primaryAccount = licensedPrimaryAccount ?? await prisma.user.findFirst({
    where: { tenantId: tenant.id, isActive: true, userRoles: { some: { role: { name: "系統管理員" } } } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { username: true, email: true, name: true },
  }) ?? await prisma.user.findFirst({
    where: { tenantId: tenant.id, isActive: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { username: true, email: true, name: true },
  });
  if (!primaryAccount) return NextResponse.json({ error: "租戶管理者帳號尚未同步" }, { status: 503 });

  return NextResponse.json({
    companyName: tenant.name,
    businessMode: normalizeBusinessMode(tenant.businessMode),
    username: primaryAccount.username,
    email: primaryAccount.email,
    managerName: primaryAccount.name,
  }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}
