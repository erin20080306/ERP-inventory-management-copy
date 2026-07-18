import { createHash } from "node:crypto";
import { deflateRawSync } from "node:zlib";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const version = "v1.1.0-update-center";
const generatedAt = new Date().toISOString();
const outputPath = path.join(root, "src", "generated", "embedded-host-installers.ts");

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

function u16(value) {
  const buffer = Buffer.allocUnsafe(2);
  buffer.writeUInt16LE(value & 0xffff);
  return buffer;
}

function u32(value) {
  const buffer = Buffer.allocUnsafe(4);
  buffer.writeUInt32LE(value >>> 0);
  return buffer;
}

function createZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  const stamp = dosDateTime();

  for (const entry of entries) {
    const name = Buffer.from(entry.name.replaceAll("\\", "/"), "utf8");
    const source = Buffer.isBuffer(entry.content) ? entry.content : Buffer.from(entry.content, "utf8");
    const compressed = deflateRawSync(source, { level: 9 });
    const checksum = crc32(source);
    const mode = entry.mode ?? 0o100644;

    const local = Buffer.concat([
      u32(0x04034b50), u16(20), u16(0x0800), u16(8), u16(stamp.time), u16(stamp.date),
      u32(checksum), u32(compressed.length), u32(source.length), u16(name.length), u16(0), name, compressed,
    ]);
    locals.push(local);

    const central = Buffer.concat([
      u32(0x02014b50), u16(0x031e), u16(20), u16(0x0800), u16(8), u16(stamp.time), u16(stamp.date),
      u32(checksum), u32(compressed.length), u32(source.length), u16(name.length), u16(0), u16(0),
      u16(0), u16(0), u32((mode & 0xffff) << 16), u32(offset), name,
    ]);
    centrals.push(central);
    offset += local.length;
  }

  const centralDirectory = Buffer.concat(centrals);
  const end = Buffer.concat([
    u32(0x06054b50), u16(0), u16(0), u16(entries.length), u16(entries.length),
    u32(centralDirectory.length), u32(offset), u16(0),
  ]);
  return Buffer.concat([...locals, centralDirectory, end]);
}

function text(file) {
  return readFileSync(path.join(root, file));
}

const common = [
  { name: "主機安裝說明.txt", content: text("installer/主機安裝說明.txt") },
  { name: "docker-compose.local.yml", content: text("docker-compose.local.yml") },
  { name: "docker/Caddyfile", content: text("docker/Caddyfile") },
  { name: "updater/Dockerfile", content: text("updater/Dockerfile") },
  { name: "updater/health", content: text("updater/health") },
  { name: "updater/update.cgi", content: text("updater/update.cgi"), mode: 0o100755 },
  { name: "image-tag.txt", content: "latest\n" },
];

const macInstaller = text("installer/安裝艾琳ERP.command");
const macRootLauncher = "#!/bin/bash\nset -e\nSCRIPT_DIR=\"$(cd \"$(dirname \"$0\")\" && pwd)\"\nexec \"$SCRIPT_DIR/installer/Install-ErinERP.command\"\n";
const windowsInstaller = text("installer/安裝艾琳ERP.ps1");
const windowsRootLauncher = "@echo off\r\nchcp 65001 >nul\r\npowershell.exe -NoProfile -ExecutionPolicy Bypass -File \"%~dp0installer\\Install-ErinERP.ps1\"\r\nif errorlevel 1 pause\r\n";
const windowsNestedLauncher = "@echo off\r\nchcp 65001 >nul\r\npowershell.exe -NoProfile -ExecutionPolicy Bypass -File \"%~dp0Install-ErinERP.ps1\"\r\nif errorlevel 1 pause\r\n";

const packages = [
  {
    name: `ErinERP-Host-Windows-${version}.zip`,
    platform: "Windows 公司主機（需 Docker Desktop）",
    entries: [
      ...common,
      { name: "安裝艾琳ERP.bat", content: windowsRootLauncher },
      { name: "installer/Install-ErinERP.ps1", content: windowsInstaller },
      { name: "installer/Install-ErinERP.bat", content: windowsNestedLauncher },
    ],
  },
  {
    name: `ErinERP-Host-macOS-${version}.zip`,
    platform: "macOS 公司主機（一鍵檢查並引導 Docker Desktop）",
    entries: [
      ...common,
      { name: "安裝艾琳ERP.command", content: macRootLauncher, mode: 0o100755 },
      { name: "installer/Install-ErinERP.command", content: macInstaller, mode: 0o100755 },
    ],
  },
];

const files = Object.fromEntries(packages.map((item) => {
  const archive = createZip(item.entries);
  return [item.name, {
    name: item.name,
    platform: item.platform,
    size: archive.length,
    sha256: createHash("sha256").update(archive).digest("hex"),
    base64: archive.toString("base64"),
  }];
}));

mkdirSync(path.dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `// Generated by scripts/generate-embedded-host-installers.mjs\nexport const EMBEDDED_HOST_RELEASE = ${JSON.stringify({ version, generatedAt, files }, null, 2)} as const;\n`);
console.log(`Embedded Host installers generated: ${Object.keys(files).join(", ")}`);
