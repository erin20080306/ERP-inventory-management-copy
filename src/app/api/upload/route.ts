import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/api";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: "未授權" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File;
    
    if (!file) {
      return NextResponse.json({ error: "未提供檔案" }, { status: 400 });
    }

    // 檢查檔案類型
    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"];
    if (!allowedTypes.includes(file.type)) {
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
    const ext = file.name.split('.').pop();
    const filename = `${timestamp}-${random}.${ext}`;
    
    // 確保 uploads 目錄存在
    const uploadDir = path.join(process.cwd(), "public", "uploads");
    if (!existsSync(uploadDir)) {
      await mkdir(uploadDir, { recursive: true });
    }
    
    // 保存檔案
    const filepath = path.join(uploadDir, filename);
    await writeFile(filepath, buffer);
    
    // 返回可訪問的 URL（包含完整域名）
    const host = req.headers.get("host") || "";
    const protocol = host.includes("localhost") ? "http" : "https";
    const url = `${protocol}://${host}/uploads/${filename}`;
    
    return NextResponse.json({ url });
  } catch (error: any) {
    console.error("上傳錯誤:", error);
    return NextResponse.json({ error: error.message || "上傳失敗" }, { status: 500 });
  }
}
