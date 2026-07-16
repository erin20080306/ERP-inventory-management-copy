import { NextRequest, NextResponse } from "next/server";
import { apiHandler, audit, requirePermission, requireTenantId } from "@/lib/api";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";

export const POST = apiHandler(async (req: NextRequest) => {
    const session = await requirePermission("products.edit");
    const tenantId = await requireTenantId(session);
    const formData = await req.formData();
    const file = formData.get("file");
    
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "未提供檔案" }, { status: 400 });
    }

    // 檢查檔案類型
    const allowedTypes: Record<string, string> = { "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };
    if (!allowedTypes[file.type]) {
      return NextResponse.json({ error: "不支援的檔案類型" }, { status: 400 });
    }

    // 檢查檔案大小 (限制 5MB)
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json({ error: "檔案大小超過 5MB 限制" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    
    // 生成唯一檔名
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 10);
    const ext = allowedTypes[file.type];
    const filename = `${timestamp}-${random}.${ext}`;
    
    // 確保 uploads 目錄存在
    const uploadDir = path.join(process.cwd(), "public", "uploads", tenantId);
    await mkdir(uploadDir, { recursive: true });
    
    // 保存檔案
    const filepath = path.join(uploadDir, filename);
    await writeFile(filepath, buffer);
    
    const url = `/uploads/${tenantId}/${filename}`;
    
    await audit({ userId: session.user.id, action: "upload_image", module: "products", refId: filename });
    return NextResponse.json({ url });
});
