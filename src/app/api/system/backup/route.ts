import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { NextRequest, NextResponse } from "next/server";
import { ApiError, apiHandler, audit, requirePermission } from "@/lib/api";
import { assertSafeBackupName, createEncryptedDatabaseBackup, listEncryptedBackups } from "@/lib/encrypted-backup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function backupDirectory() {
  if (process.env.LOCAL_LICENSE_MODE !== "true") throw new ApiError(403, "完整資料庫備份只在客戶本機公司主機執行");
  if (!process.env.BACKUP_ENCRYPTION_KEY) throw new ApiError(503, "尚未設定加密備份金鑰，請重新執行主機安裝或聯絡艾琳設計");
  return process.env.BACKUP_DIR || "/backups";
}

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission("settings.export");
  const directory = backupDirectory();
  const requested = req.nextUrl.searchParams.get("file");
  if (!requested) return NextResponse.json({ files: await listEncryptedBackups(directory) });
  let name: string;
  try { name = assertSafeBackupName(requested); }
  catch { throw new ApiError(400, "備份檔名不合法"); }
  const file = path.join(directory, name);
  let info;
  try { info = await stat(file); }
  catch { throw new ApiError(404, "找不到備份檔"); }
  const stream = Readable.toWeb(createReadStream(file));
  return new Response(stream as BodyInit, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Content-Length": String(info.size),
      "Cache-Control": "private, no-store",
    },
  });
});

export const POST = apiHandler(async () => {
  const session = await requirePermission("settings.export");
  backupDirectory();
  try {
    const backup = await createEncryptedDatabaseBackup();
    await audit({ userId: session.user.id, action: "create_encrypted_database_backup", module: "settings", detail: backup.name });
    return NextResponse.json({ ok: true, backup });
  } catch (error) {
    console.error("encrypted backup failed", error);
    throw new ApiError(500, error instanceof Error ? error.message : "加密備份失敗");
  }
});
