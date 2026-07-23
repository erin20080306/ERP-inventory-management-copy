import { execFileSync } from "node:child_process";
import { chmodSync, cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { writeReleaseManifest } from "./write-release-manifest.mjs";

const root = process.cwd();
const packageJson = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const rawVersion = process.argv[2] || process.env.GITHUB_REF_NAME || `v${packageJson.version}-local`;
const version = rawVersion.replace(/[^A-Za-z0-9._-]/g, "-");
const imageTag = process.argv[3] || (process.env.GITHUB_REF_NAME ? rawVersion : "latest");
const outputDir = path.join(root, "dist", "desktop");
const stagingDir = path.join(root, "dist", ".host-installer-staging");
const updaterImage = "erin-erp-host-updater:2";

rmSync(stagingDir, { recursive: true, force: true });
mkdirSync(outputDir, { recursive: true });

function installerCompose() {
  const source = readFileSync(path.join(root, "docker-compose.local.yml"), "utf8");
  if (!source.includes(`image: ${updaterImage}`)) {
    throw new Error(`docker-compose.local.yml must use ${updaterImage}`);
  }
  return source;
}

function prepare(platform) {
  const target = path.join(stagingDir, platform);
  mkdirSync(path.join(target, "installer"), { recursive: true });
  mkdirSync(path.join(target, "docker"), { recursive: true });
  mkdirSync(path.join(target, "updater"), { recursive: true });
  cpSync(path.join(root, "installer", "主機安裝說明.txt"), path.join(target, "主機安裝說明.txt"));
  writeFileSync(path.join(target, "docker-compose.local.yml"), installerCompose());
  cpSync(path.join(root, "docker", "Caddyfile"), path.join(target, "docker", "Caddyfile"));
  cpSync(path.join(root, "updater", "Dockerfile"), path.join(target, "updater", "Dockerfile"));
  cpSync(path.join(root, "updater", "health"), path.join(target, "updater", "health"));
  cpSync(path.join(root, "updater", "update.cgi"), path.join(target, "updater", "update.cgi"));
  writeFileSync(path.join(target, "image-tag.txt"), `${imageTag}\n`);
  return target;
}

const mac = prepare("macos");
const macRootLauncher = "#!/bin/bash\nset -e\nSCRIPT_DIR=\"$(cd \"$(dirname \"$0\")\" && pwd)\"\nexec \"$SCRIPT_DIR/installer/Install-ErinERP.command\"\n";
writeFileSync(path.join(mac, "安裝艾琳ERP.command"), macRootLauncher);
cpSync(path.join(root, "installer", "安裝艾琳ERP.command"), path.join(mac, "installer", "Install-ErinERP.command"));
chmodSync(path.join(mac, "安裝艾琳ERP.command"), 0o755);
chmodSync(path.join(mac, "installer", "Install-ErinERP.command"), 0o755);

const windows = prepare("windows");
cpSync(path.join(root, "installer", "安裝艾琳ERP.ps1"), path.join(windows, "installer", "Install-ErinERP.ps1"));
const rootLauncher = "@echo off\r\nchcp 65001 >nul\r\npowershell.exe -NoProfile -ExecutionPolicy Bypass -File \"%~dp0installer\\Install-ErinERP.ps1\"\r\nif errorlevel 1 pause\r\n";
const nestedLauncher = "@echo off\r\nchcp 65001 >nul\r\npowershell.exe -NoProfile -ExecutionPolicy Bypass -File \"%~dp0Install-ErinERP.ps1\"\r\nif errorlevel 1 pause\r\n";
writeFileSync(path.join(windows, "安裝艾琳ERP.bat"), rootLauncher);
writeFileSync(path.join(windows, "installer", "Install-ErinERP.bat"), nestedLauncher);

const artifacts = [
  { platform: "macOS", staging: mac, name: `ErinERP-Host-macOS-${version}.zip` },
  { platform: "Windows", staging: windows, name: `ErinERP-Host-Windows-${version}.zip` },
];

for (const artifact of artifacts) {
  const target = path.join(outputDir, artifact.name);
  rmSync(target, { force: true });
  execFileSync("zip", ["-qr", target, "."], { cwd: artifact.staging, stdio: "inherit" });
}
writeReleaseManifest(outputDir, rawVersion, { desktopSigned: false });
rmSync(stagingDir, { recursive: true, force: true });

console.log(`Host installers: PASS (${artifacts.map((item) => item.name).join(", ")})`);
