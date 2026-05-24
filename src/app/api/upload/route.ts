import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/api";

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

    // 檢查檔案大小 (限制 2MB，因為存儲在資料庫中)
    const maxSize = 2 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json({ error: "檔案大小超過 2MB 限制" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    
    // 轉換為 base64 data URL
    const base64 = buffer.toString("base64");
    const dataUrl = `data:${file.type};base64,${base64}`;
    
    return NextResponse.json({ url: dataUrl });
  } catch (error: any) {
    console.error("上傳錯誤:", error);
    return NextResponse.json({ error: error.message || "上傳失敗" }, { status: 500 });
  }
}
