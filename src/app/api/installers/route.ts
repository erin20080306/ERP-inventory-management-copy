import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { ApiError, apiHandler, requireAuth } from "@/lib/api";
import { getEmbeddedHostInstaller } from "@/lib/embedded-host-release";
import { getLicenseAccessForUser } from "@/lib/license";
import { getInstallerRelease, getPrivateInstallerBlob, INSTALLER_METADATA, INSTALLER_NAME } from "@/lib/installer-release-current";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = apiHandler(async (req: NextRequest) => {
  const session = await requireAuth();
  const access = await getLicenseAccessForUser(session.user.id);
  if (access.status !== "paid") throw new ApiError(403, "完成付款並由管理者開通後才提供正式安裝包");
  const release = await getInstallerRelease({ allowPrerelease: true });
  if (!release) return NextResponse.json({ files: [], release: null, message: "正式安裝版尚未發布" });

  if (!release.readyForCustomers) {
    return NextResponse.json({
      files: [],
      release: { version: release.version, generatedAt: release.generatedAt, prerelease: release.prerelease, readyForCustomers: false },
      message: "可交付的正式簽章版或手動安裝版尚未發布；為避免安裝失敗，未驗證的測試包不提供客戶下載。",
    });
  }

  const requested = req.nextUrl.searchParams.get("file");
  if (!requested) return NextResponse.json({
    files: release.files,
    release: { version: release.version, generatedAt: release.generatedAt, prerelease: release.prerelease, readyForCustomers: release.readyForCustomers },
  });
  const safeName = path.basename(requested);
  const file = release.files.find((item) => item.name === safeName);
  const target = file?.downloadUrl ?? release.metadata[safeName];
  if (safeName !== requested || (!file && !target) || (!INSTALLER_NAME.test(safeName) && !INSTALLER_METADATA.test(safeName))) {
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

  if (release.storage === "blob") {
    const blob = await getPrivateInstallerBlob(release, safeName);
    if (!blob || blob.statusCode !== 200) throw new ApiError(404, "找不到私人安裝包");
    return new Response(blob.stream, { headers: {
      "Content-Type": blob.blob.contentType || "application/octet-stream",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(safeName)}`,
      "Content-Length": String(blob.blob.size),
      "Cache-Control": "private, no-store",
    } });
  }
  return NextResponse.redirect(target, 307);
});
