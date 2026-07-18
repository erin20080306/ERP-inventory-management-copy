import { NextResponse } from "next/server";
import { ApiError, apiHandler, audit, requirePermission } from "@/lib/api";
import { createEncryptedDatabaseBackup } from "@/lib/encrypted-backup";
import {
  currentHostVersion,
  fetchCurrentHostRelease,
  readHostUpdateState,
  triggerHostUpdater,
  writeHostUpdateState,
} from "@/lib/host-update";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function localHost() {
  return process.env.LOCAL_LICENSE_MODE === "true";
}

export const GET = apiHandler(async () => {
  await requirePermission("settings.manage");
  if (!localHost()) return NextResponse.json({ localHost: false });
  const currentVersion = currentHostVersion();
  const state = await readHostUpdateState();
  try {
    const latest = await fetchCurrentHostRelease();
    return NextResponse.json({
      localHost: true,
      updaterReady: Boolean(process.env.HOST_UPDATE_URL && process.env.HOST_UPDATE_TOKEN),
      currentVersion,
      latestVersion: latest.version,
      updateAvailable: latest.version !== "development" && currentVersion !== latest.version,
      publishedAt: latest.publishedAt,
      status: state,
    });
  } catch (error) {
    return NextResponse.json({
      localHost: true,
      updaterReady: Boolean(process.env.HOST_UPDATE_URL && process.env.HOST_UPDATE_TOKEN),
      currentVersion,
      latestVersion: null,
      updateAvailable: false,
      status: state,
      checkError: error instanceof Error ? error.message : "無法查詢中央版本",
    });
  }
});

export const POST = apiHandler(async () => {
  const session = await requirePermission("settings.manage");
  if (!localHost()) throw new ApiError(403, "只有客戶公司主機可以執行系統更新");
  if (!process.env.HOST_UPDATE_URL || !process.env.HOST_UPDATE_TOKEN) {
    throw new ApiError(503, "背景更新服務尚未安裝，請先執行新版 Host 安裝包一次；之後即可在 ERP 內更新");
  }
  const latest = await fetchCurrentHostRelease();
  let backup;
  try {
    backup = await createEncryptedDatabaseBackup();
  } catch (error) {
    throw new ApiError(500, `更新前備份失敗，已取消更新：${error instanceof Error ? error.message : "未知錯誤"}`);
  }
  const currentVersion = currentHostVersion();
  await writeHostUpdateState({
    state: "queued",
    message: "加密完整備份已完成，等待背景更新服務接手",
    fromVersion: currentVersion,
    toVersion: latest.version,
    updatedAt: new Date().toISOString(),
  });
  await audit({
    userId: session.user.id,
    action: "backup_and_update_host",
    module: "settings",
    detail: `${currentVersion} -> ${latest.version}; backup=${backup.name}`,
  });

  setTimeout(() => {
    void triggerHostUpdater().catch(async (error) => {
      console.error("host updater failed", error);
      await writeHostUpdateState({
        state: "failed",
        message: error instanceof Error ? error.message : "背景更新服務失敗",
        fromVersion: currentVersion,
        toVersion: latest.version,
        updatedAt: new Date().toISOString(),
      }).catch(() => undefined);
    });
  }, 1_000);

  return NextResponse.json({ ok: true, accepted: true, backup, currentVersion, targetVersion: latest.version }, { status: 202 });
});
