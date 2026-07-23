import { createHash, randomBytes } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import { ApiError } from "./api";
import { computeLicenseAccess } from "./license";
import { prisma } from "./prisma";
import { normalizeStoreSlug } from "./storefront-branding";

const SESSION_DAYS = 30;
const MAX_ACTIVE_SESSIONS = 5;
const authAttempts = new Map<string, { count: number; resetAt: number }>();

function hashToken(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function storefrontMemberCookieName(tenantId: string) {
  return `erin_store_member_${createHash("sha256").update(tenantId).digest("hex").slice(0, 18)}`;
}

export async function resolveStorefrontTenant(rawKey: string) {
  const key = decodeURIComponent(rawKey).trim();
  if (!key || key.length > 100) throw new ApiError(404, "找不到商城");
  const tenant = await prisma.tenant.findFirst({
    where: {
      isInternal: false,
      businessMode: "ECOMMERCE",
      OR: [
        { id: key },
        { companyCode: key.toUpperCase() },
        { companySettings: { some: { storeSlug: normalizeStoreSlug(key) } } },
      ],
    },
    select: {
      id: true,
      name: true,
      createdAt: true,
      licensePlan: true,
      licenseBilling: true,
      licenseStatus: true,
      licenseSeatLimit: true,
      licenseActivatedAt: true,
      licenseExpiresAt: true,
      licenseKeyHash: true,
      licenseVersion: true,
    },
  });
  if (!tenant) throw new ApiError(404, "找不到已啟用的電商租戶");
  const access = computeLicenseAccess({
    tenantCreatedAt: tenant.createdAt,
    licensePlan: tenant.licensePlan,
    licenseBilling: tenant.licenseBilling,
    licenseStatus: tenant.licenseStatus,
    licenseSeatLimit: tenant.licenseSeatLimit,
    licenseActivatedAt: tenant.licenseActivatedAt,
    licenseExpiresAt: tenant.licenseExpiresAt,
    licenseKeyHash: tenant.licenseKeyHash,
    licenseVersion: tenant.licenseVersion,
  });
  return { tenant, access };
}

export function allowStorefrontMemberAttempt(req: NextRequest, tenantId: string, action: "register" | "login") {
  const ip = (req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown").split(",")[0].trim();
  const key = `${action}:${tenantId}:${hashToken(ip)}`;
  const now = Date.now();
  const current = authAttempts.get(key);
  const limit = action === "login" ? 12 : 6;
  if (!current || current.resetAt <= now) {
    authAttempts.set(key, { count: 1, resetAt: now + 15 * 60_000 });
    return true;
  }
  if (current.count >= limit) return false;
  current.count += 1;
  return true;
}

export async function createStorefrontMemberSession(tenantId: string, memberId: string) {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await prisma.$transaction(async (tx) => {
    await tx.storefrontMemberSession.deleteMany({
      where: { memberId, OR: [{ expiresAt: { lte: new Date() } }, { tenantId: { not: tenantId } }] },
    });
    const oldSessions = await tx.storefrontMemberSession.findMany({
      where: { memberId, tenantId },
      orderBy: { createdAt: "desc" },
      skip: MAX_ACTIVE_SESSIONS - 1,
      select: { id: true },
    });
    if (oldSessions.length) {
      await tx.storefrontMemberSession.deleteMany({ where: { id: { in: oldSessions.map((row) => row.id) } } });
    }
    await tx.storefrontMemberSession.create({ data: { tenantId, memberId, tokenHash, expiresAt } });
  });
  return { token, expiresAt };
}

export function setStorefrontMemberCookie(response: NextResponse, tenantId: string, token: string, expiresAt: Date) {
  response.cookies.set(storefrontMemberCookieName(tenantId), token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export function clearStorefrontMemberCookie(response: NextResponse, tenantId: string) {
  response.cookies.set(storefrontMemberCookieName(tenantId), "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

export async function readStorefrontMemberSession(req: NextRequest, tenantId: string) {
  const token = req.cookies.get(storefrontMemberCookieName(tenantId))?.value;
  if (!token) return null;
  const now = new Date();
  const session = await prisma.storefrontMemberSession.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      member: {
        include: {
          customer: true,
        },
      },
    },
  });
  if (
    !session ||
    session.tenantId !== tenantId ||
    session.expiresAt <= now ||
    !session.member.isActive ||
    !session.member.customer.isActive
  ) {
    if (session) await prisma.storefrontMemberSession.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  if (now.getTime() - session.lastSeenAt.getTime() > 5 * 60_000) {
    void prisma.storefrontMemberSession.update({ where: { id: session.id }, data: { lastSeenAt: now } }).catch(() => undefined);
  }
  return session;
}

export async function revokeStorefrontMemberSession(req: NextRequest, tenantId: string) {
  const token = req.cookies.get(storefrontMemberCookieName(tenantId))?.value;
  if (!token) return;
  await prisma.storefrontMemberSession.deleteMany({ where: { tenantId, tokenHash: hashToken(token) } });
}
