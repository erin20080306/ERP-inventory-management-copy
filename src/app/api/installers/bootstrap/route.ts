import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { computeLicenseAccess, hashActivationKey } from "@/lib/license";
import { prisma } from "@/lib/prisma";
import { getInstallerRelease, getPrivateInstallerBlob } from "@/lib/installer-release-current";
import { getPrivateInstallerBlobPath, isPrivateInstallerBlobPath } from "@/lib/private-installer-blob";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const attempts = new Map<string, { count: number; resetAt: number }>();

function allowedAttempt(req: NextRequest) {
  const ip = (req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown").split(",")[0].trim();
  const now = Date.now();
  const row = attempts.get(ip);
  if (!row || row.resetAt <= now) { attempts.set(ip, { count: 1, resetAt: now + 60_000 }); return true; }
  if (row.count >= 20) return false;
  row.count += 1;
  return true;
}

export async function GET(req: NextRequest) {
  if (!allowedAttempt(req)) return NextResponse.json({ error: "下載請求過於頻繁" }, { status: 429 });
  const activationKey = req.headers.get("x-erin-activation-key")?.trim() || "";
  if (activationKey.length < 24 || activationKey.length > 200) return NextResponse.json({ error: "啟用碼格式錯誤" }, { status: 401 });
  const tenant = await prisma.tenant.findUnique({
    where: { licenseKeyHash: hashActivationKey(activationKey) },
    select: {
      createdAt: true, licensePlan: true, licenseBilling: true, licenseStatus: true, licenseSeatLimit: true,
      licenseActivatedAt: true, licenseExpiresAt: true, licenseKeyHash: true, licenseVersion: true,
    },
  });
  if (!tenant) return NextResponse.json({ error: "啟用碼無效" }, { status: 401 });
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
  if (!access.allowed || access.status !== "paid") return NextResponse.json({ error: access.reason || "授權尚未開通" }, { status: 403 });

  const platform = req.nextUrl.searchParams.get("platform");
  const arch = req.nextUrl.searchParams.get("arch");
  if (!['macos', 'windows'].includes(platform || '') || !['arm64', 'x64'].includes(arch || '')) {
    return NextResponse.json({ error: "平台或處理器格式錯誤" }, { status: 400 });
  }
  const release = await getInstallerRelease({ allowPrerelease: true });
  if (!release?.readyForCustomers) return NextResponse.json({ error: "正式簽章工作站安裝版尚未發布" }, { status: 503 });
  const candidates = release.files.filter((file) => file.kind === "workstation");
  const file = platform === "windows"
    ? candidates.find((item) => /windows.*x64.*setup\.exe$/i.test(item.name))
    : candidates.find((item) => new RegExp(`macos.*${arch}.*\\.dmg$`, "i").test(item.name));
  if (!file) return NextResponse.json({ error: `尚未提供 ${platform} ${arch} 工作站安裝版` }, { status: 404 });

  const safeName = path.basename(file.name);
  if (req.nextUrl.searchParams.get("delivery") === "location" && release.storage === "github" && /^https:\/\/github\.com\//i.test(file.downloadUrl)) {
    return NextResponse.json({ name: safeName, downloadUrl: file.downloadUrl, sha256: file.sha256 }, { headers: { "Cache-Control": "private, no-store" } });
  }
  if (req.nextUrl.searchParams.get("delivery") === "location") {
    return NextResponse.json({ name: safeName, downloadUrl: null, sha256: file.sha256 }, { headers: { "Cache-Control": "private, no-store" } });
  }
  if (isPrivateInstallerBlobPath(file.downloadUrl)) {
    const blob = await getPrivateInstallerBlobPath(file.downloadUrl);
    if (!blob || blob.statusCode !== 200) return NextResponse.json({ error: "找不到工作站安裝包" }, { status: 404 });
    return new Response(blob.stream, { headers: {
      "Content-Type": blob.blob.contentType || "application/octet-stream",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(safeName)}`,
      "Content-Length": String(blob.blob.size),
      "Cache-Control": "private, no-store",
      ...(file.sha256 ? { "X-Content-SHA256": file.sha256 } : {}),
    } });
  }
  if (release.storage === "blob") {
    const blob = await getPrivateInstallerBlob(release, safeName);
    if (!blob || blob.statusCode !== 200) return NextResponse.json({ error: "找不到工作站安裝包" }, { status: 404 });
    return new Response(blob.stream, { headers: {
      "Content-Type": blob.blob.contentType || "application/octet-stream",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(safeName)}`,
      "Content-Length": String(blob.blob.size),
      "Cache-Control": "private, no-store",
      ...(file.sha256 ? { "X-Content-SHA256": file.sha256 } : {}),
    } });
  }
  const remote = await fetch(file.downloadUrl, { headers: { "User-Agent": "ErinERP-Host-Installer" }, cache: "no-store" });
  if (!remote.ok || !remote.body) return NextResponse.json({ error: "工作站安裝包下載失敗" }, { status: 502 });
  return new Response(remote.body, { headers: {
    "Content-Type": remote.headers.get("content-type") || "application/octet-stream",
    "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(safeName)}`,
    ...(remote.headers.get("content-length") ? { "Content-Length": remote.headers.get("content-length")! } : {}),
    "Cache-Control": "private, no-store",
    ...(file.sha256 ? { "X-Content-SHA256": file.sha256 } : {}),
  } });
}
