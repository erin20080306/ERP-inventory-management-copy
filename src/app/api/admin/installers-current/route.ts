import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { ApiError, apiHandler, requireAuth } from "@/lib/api";
import { getEmbeddedHostInstaller } from "@/lib/embedded-host-release";
import { getInstallerRelease, INSTALLER_METADATA, INSTALLER_NAME } from "@/lib/installer-release-current";
import { getPrivateInstallerBlobPath, isPrivateInstallerBlobPath } from "@/lib/private-installer-blob";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = apiHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  if (!session.user.isSuperAdmin) throw new ApiError(403, "僅限平台管理員下載安裝包");

  const release = await getInstallerRelease({ allowPrerelease: true, localFallback: process.env.NODE_ENV !== "production" });
  const requested = req.nextUrl.searchParams.get("file");
  if (!requested) {
    return NextResponse.json({
      files: release?.files ?? [],
      release: release ? {
        version: release.version,
        generatedAt: release.generatedAt,
        prerelease: release.prerelease,
        readyForCustomers: release.readyForCustomers,
      } : null,
    });
  }

  const safeName = path.basename(requested);
  if (safeName !== requested || (!INSTALLER_NAME.test(safeName) && !INSTALLER_METADATA.test(safeName))) {
    throw new ApiError(404, "找不到安裝包");
  }

  const embedded = getEmbeddedHostInstaller(safeName);
  if (embedded) {
    return new Response(embedded.buffer, { headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(safeName)}`,
      "Content-Length": String(embedded.size),
      "Cache-Control": "private, no-store",
      "X-Content-SHA256": embedded.sha256,
    } });
  }

  const file = release?.files.find((item) => item.name === safeName);
  const target = file?.downloadUrl ?? release?.metadata[safeName];
  if (isPrivateInstallerBlobPath(target)) {
    const blob = await getPrivateInstallerBlobPath(target!);
    if (!blob || blob.statusCode !== 200) throw new ApiError(404, "找不到私人安裝包");
    return new Response(blob.stream, { headers: {
      "Content-Type": blob.blob.contentType || "application/octet-stream",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(safeName)}`,
      "Content-Length": String(blob.blob.size),
      "Cache-Control": "private, no-store",
    } });
  }
  if (target && /^https?:\/\//i.test(target)) return NextResponse.redirect(target, 302);

  const fallback = new URL("/api/admin/installers", req.url);
  fallback.searchParams.set("file", safeName);
  return NextResponse.redirect(fallback, 302);
});
