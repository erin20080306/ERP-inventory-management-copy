import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { head, put } from "@vercel/blob";

const outputDir = path.resolve(process.cwd(), "dist", "desktop");
const prefix = "installers/current";
const token = process.env.BLOB_READ_WRITE_TOKEN;

if (!token) {
  throw new Error("缺少 BLOB_READ_WRITE_TOKEN；請先從已連結的 Vercel Production 環境載入私有 Blob 設定");
}

const manifestPath = path.join(outputDir, "release-manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
if (manifest?.schema !== "erin-erp-release-manifest-v1" || !Array.isArray(manifest.artifacts)) {
  throw new Error("release-manifest.json 格式不正確");
}

function sha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const input = createReadStream(filePath);
    input.on("error", reject);
    input.on("data", (chunk) => hash.update(chunk));
    input.on("end", () => resolve(hash.digest("hex")));
  });
}

async function upload(name, expectedSize) {
  if (path.basename(name) !== name) throw new Error(`不允許的檔名：${name}`);
  const source = path.join(outputDir, name);
  const info = await stat(source);
  if (expectedSize != null && info.size !== expectedSize) throw new Error(`${name} 檔案大小與版本清單不符`);
  const pathname = `${prefix}/${name}`;
  process.stdout.write(`上傳 ${name} (${(info.size / 1024 / 1024).toFixed(1)} MB)... `);
  await put(pathname, createReadStream(source), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    multipart: info.size > 10 * 1024 * 1024,
    token,
  });
  const remote = await head(pathname, { token });
  if (remote.size !== info.size) throw new Error(`${name} 上傳後大小驗證失敗`);
  process.stdout.write("完成\n");
}

for (const artifact of manifest.artifacts) {
  if (!/^ErinERP-(?:Desktop|Host)-[A-Za-z0-9._-]+\.(?:exe|dmg|zip)$/i.test(artifact.name)) {
    throw new Error(`版本清單含有不允許的安裝檔：${artifact.name}`);
  }
  const source = path.join(outputDir, artifact.name);
  const actualHash = await sha256(source);
  if (actualHash !== artifact.sha256) throw new Error(`${artifact.name} SHA-256 驗證失敗`);
  await upload(artifact.name, artifact.size);
}

await upload("SHA256SUMS.txt");
// 最後才覆寫 manifest，避免客戶看到尚未完整上傳的新版清單。
await upload("release-manifest.json");
process.stdout.write(`私有安裝包 ${manifest.version ?? "current"} 已發布完成\n`);
