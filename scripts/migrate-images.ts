import { PrismaClient } from "@prisma/client";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

const prisma = new PrismaClient();

async function migrateImages() {
  console.log("開始遷移圖片...");
  
  try {
    // 獲取所有有 imageUrl 的商品
    const products = await prisma.product.findMany({
      where: {
        imageUrl: {
          not: null,
          startsWith: "data:image",
        },
      },
    });
    
    console.log(`找到 ${products.length} 個需要遷移的商品`);
    
    // 確保 uploads 目錄存在
    const uploadDir = path.join(process.cwd(), "public", "uploads");
    if (!existsSync(uploadDir)) {
      await mkdir(uploadDir, { recursive: true });
    }
    
    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;
    
    for (const product of products) {
      try {
        const imageUrl = product.imageUrl!;
        
        // 檢查是否已經是 HTTP URL
        if (!imageUrl.startsWith("data:image")) {
          console.log(`跳過 ${product.sku}：已經是 HTTP URL`);
          skipCount++;
          continue;
        }
        
        // 解析 base64
        const matches = imageUrl.match(/^data:image\/(\w+);base64,(.+)$/);
        if (!matches) {
          console.log(`跳過 ${product.sku}：無法解析 base64`);
          skipCount++;
          continue;
        }
        
        const ext = matches[1];
        const base64Data = matches[2];
        const buffer = Buffer.from(base64Data, "base64");
        
        // 生成唯一檔名
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 10);
        const filename = `${timestamp}-${random}.${ext}`;
        
        // 保存檔案
        const filepath = path.join(uploadDir, filename);
        await writeFile(filepath, buffer);
        
        // 更新資料庫
        const newUrl = `/uploads/${filename}`;
        await prisma.product.update({
          where: { id: product.id },
          data: { imageUrl: newUrl },
        });
        
        console.log(`✓ ${product.sku}：${imageUrl.substring(0, 50)}... -> ${newUrl}`);
        successCount++;
      } catch (error) {
        console.error(`✗ ${product.sku}：遷移失敗`, error);
        errorCount++;
      }
    }
    
    console.log("\n遷移完成！");
    console.log(`成功：${successCount}`);
    console.log(`跳過：${skipCount}`);
    console.log(`失敗：${errorCount}`);
  } catch (error) {
    console.error("遷移過程發生錯誤：", error);
  } finally {
    await prisma.$disconnect();
  }
}

migrateImages();
