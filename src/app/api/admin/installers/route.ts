import { NextRequest, NextResponse } from "next/server";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { ApiError, apiHandler, requireAuth } from "@/lib/api";
import { getInstallerRelease, getPrivateInstallerBlob, INSTALLER_METADATA, INSTALLER_NAME } from "@/lib/installer-release";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OUTPUT_DIR = path.join(process.cwd(), "dist", "desktop");
const ALLOWED_INSTALLER = INSTALLER_NAME;
const ALLOWED_METADATA = INSTALLER_METADATA;

type ManifestArtifact = { name: string; sha256?: string; kind?: string; platform?: string };

async function readManifest() {
  try {
    const parsed = JSON.parse(await readFile(path.join(OUTPUT_DIR, "release-manifest.json"), "utf8"));
    if (parsed?.schema !== "erin-erp-release-manifest-v1" || !Array.isArray(parsed.artifacts)) return null;
    return parsed as { schema: string; version?: string; generatedAt?: string; artifacts: ManifestArtifact[] };
  } catch {
    return null;
  }
}

async function listInstallers() {
  try {
    const names = (await readdir(OUTPUT_DIR)).filter((name) => ALLOWED_INSTALLER.test(name));
    const manifest = await readManifest();
    const manifestByName = new Map((manifest?.artifacts ?? []).map((item) => [item.name, item]));
    return await Promise.all(names.map(async (name) => {
      const info = await stat(path.join(OUTPUT_DIR, name));
      const platform = /host.*windows/i.test(name)
        ? "Windows 公司主機（需 Docker Desktop）"
        : /host.*macos/i.test(name)
          ? "macOS 公司主機（需 Docker Desktop）"
        : /windows.*x64/i.test(name)
        ? "Windows x64（一般 Windows 電腦）"
        : /windows.*arm64/i.test(name)
          ? "Windows ARM64"
          : /macos.*arm64/i.test(name)
            ? "macOS Apple Silicon"
            : /macos/i.test(name)
              ? "macOS"
              : "其他";
      const manifestItem = manifestByName.get(name);
      return {
        name,
        size: info.size,
        updatedAt: info.mtime.toISOString(),
        platform,
        kind: name.startsWith("ErinERP-Host-") ? "company-host" : "workstation",
        sha256: manifestItem?.sha256 ?? null,
      };
    }));
  } catch {
    return [];
  }
}

export const GET = apiHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (!session.user.isSuperAdmin) throw new ApiError(403, "僅限平台管理員下載安裝包");
  const requested = req.nextUrl.searchParams.get("file");
  const source = req.nextUrl.searchParams.get("source");
  const release = await getInstallerRelease({ allowPrerelease: true, localFallback: process.env.NODE_ENV !== "production" });
  if (!requested) return NextResponse.json({
    files: release?.files ?? [],
    release: release ? { version: release.version, generatedAt: release.generatedAt, prerelease: release.prerelease, readyForCustomers: release.readyForCustomers } : null,
  });
  const safeName = path.basename(requested);
  if (safeName === requested && release?.storage === "blob" && (ALLOWED_INSTALLER.test(safeName) || ALLOWED_METADATA.test(safeName))) {
    const blob = await getPrivateInstallerBlob(release, safeName);
    if (!blob || blob.statusCode !== 200) throw new ApiError(404, "找不到私人安裝包");
    return new Response(blob.stream, { headers: {
      "Content-Type": blob.blob.contentType || "application/octet-stream",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(safeName)}`,
      "Content-Length": String(blob.blob.size),
      "Cache-Control": "private, no-store",
    } });
  }
  if (source !== "local" && release) {
    const file = release.files.find((item) => item.name === safeName);
    const metadataUrl = release.metadata[safeName];
    const target = file?.downloadUrl ?? metadataUrl;
    if (safeName === requested && target && (ALLOWED_INSTALLER.test(safeName) || ALLOWED_METADATA.test(safeName))) {
      return NextResponse.redirect(target, 307);
    }
  }
  if (process.env.NODE_ENV === "production") throw new ApiError(404, "找不到已發布安裝包");
  const files = await listInstallers();
  const isInstaller = ALLOWED_INSTALLER.test(safeName) && files.some((file) => file.name === safeName);
  if (safeName !== requested || (!isInstaller && !ALLOWED_METADATA.test(safeName))) throw new ApiError(404, "找不到安裝包");
  const content = await readFile(path.join(OUTPUT_DIR, safeName));
  return new Response(content, {
    headers: {
      "Content-Type": safeName.endsWith(".dmg") ? "application/x-apple-diskimage" : safeName.endsWith(".exe") ? "application/vnd.microsoft.portable-executable" : safeName.endsWith(".json") ? "application/json; charset=utf-8" : safeName.endsWith(".txt") ? "text/plain; charset=utf-8" : "application/zip",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(safeName)}`,
      "Cache-Control": "private, no-store",
      "Content-Length": String(content.byteLength),
    },
  });
});
