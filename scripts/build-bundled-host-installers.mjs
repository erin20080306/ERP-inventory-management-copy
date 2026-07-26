import { execFileSync } from "node:child_process";
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { sha256File, writeReleaseManifest } from "./write-release-manifest.mjs";

const root = process.cwd();
const packageJson = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const rawVersion = process.argv[2] || process.env.GITHUB_REF_NAME || `v${packageJson.version}-local`;
const version = rawVersion.replace(/[^A-Za-z0-9._-]/g, "-");
const releaseSha = String(process.env.ERIN_RELEASE_SHA || process.env.GITHUB_SHA || "development").trim();
const outputDir = path.join(root, "dist", "desktop");
const stagingDir = path.join(root, "dist", ".host-installer-staging");
const updaterImage = "erin-erp-host-updater:2";

const amd64Archive = path.resolve(
  process.env.ERIN_HOST_IMAGE_AMD64_ARCHIVE || process.argv[3] || "dist/host-images/amd64/erin-erp-host-image-amd64.tar.gz",
);
const arm64Archive = path.resolve(
  process.env.ERIN_HOST_IMAGE_ARM64_ARCHIVE || process.argv[4] || "dist/host-images/arm64/erin-erp-host-image-arm64.tar.gz",
);
const amd64ImageTag = process.env.ERIN_HOST_IMAGE_AMD64_TAG || `erin-erp-host-bundle:${releaseSha}-amd64`;
const arm64ImageTag = process.env.ERIN_HOST_IMAGE_ARM64_TAG || `erin-erp-host-bundle:${releaseSha}-arm64`;

for (const [label, file] of [["amd64", amd64Archive], ["arm64", arm64Archive]]) {
  if (!existsSync(file) || statSync(file).size === 0) {
    throw new Error(`Missing bundled ${label} Host image archive: ${file}`);
  }
}

rmSync(stagingDir, { recursive: true, force: true });
mkdirSync(outputDir, { recursive: true });

function installerCompose() {
  const source = readFileSync(path.join(root, "docker-compose.local.yml"), "utf8");
  if (!source.includes(`image: ${updaterImage}`)) {
    throw new Error(`docker-compose.local.yml must use ${updaterImage}`);
  }
  return source;
}

function replaceOnce(source, before, after, label) {
  const index = source.indexOf(before);
  if (index < 0) throw new Error(`Unable to prepare bundled installer: ${label}`);
  if (source.indexOf(before, index + before.length) >= 0) {
    throw new Error(`Bundled installer replacement is ambiguous: ${label}`);
  }
  return source.slice(0, index) + after + source.slice(index + before.length);
}

function transformMacInstaller(source) {
  let result = source;
  result = replaceOnce(
    result,
    'ERP_IMAGE="ghcr.io/erin20080306/erp-inventory-management-copy:$IMAGE_TAG"\n',
    'ERP_IMAGE="ghcr.io/erin20080306/erp-inventory-management-copy:$IMAGE_TAG"\n'
      + 'BUNDLED_IMAGE_ARCHIVE="$PACKAGE_DIR/images/erin-erp-host-image.tar.gz"\n'
      + 'BUNDLED_IMAGE_TAG_FILE="$PACKAGE_DIR/bundled-image.txt"\n'
      + 'BUNDLE_ARCH_FILE="$PACKAGE_DIR/bundle-arch.txt"\n'
      + 'if [ -f "$BUNDLED_IMAGE_TAG_FILE" ]; then ERP_IMAGE="$(tr -d \'\\r\\n\' < "$BUNDLED_IMAGE_TAG_FILE")"; fi\n',
    "macOS bundled image variables",
  );
  result = replaceOnce(
    result,
    '  pause_exit 1\n}\n\ninstall_workstation_app() {',
    `  pause_exit 1
}

verify_bundle_architecture() {
  [ -f "$BUNDLE_ARCH_FILE" ] || return 0
  local expected actual hardware_arm
  expected="$(tr -d '\\r\\n' < "$BUNDLE_ARCH_FILE")"
  hardware_arm="$(sysctl -n hw.optional.arm64 2>/dev/null || true)"
  if [ "$hardware_arm" = "1" ]; then actual="arm64"; else actual="amd64"; fi
  if [ "$expected" != "$actual" ]; then
    echo "【安裝包版本不符合這台 Mac】"
    if [ "$actual" = "arm64" ]; then
      echo "這台是 Apple Silicon Mac，請下載 ErinERP-Host-macOS-Apple-Silicon-${version}.zip。"
    else
      echo "這台是 Intel Mac，請下載 ErinERP-Host-macOS-Intel-${version}.zip。"
    fi
    pause_exit 1
  fi
}

load_bundled_erp_image() {
  if [ ! -f "$BUNDLED_IMAGE_ARCHIVE" ]; then
    pull_erp_image
    return
  fi
  echo "載入安裝包內的艾琳 ERP 公司主機映像…"
  if ! docker_cli load -i "$BUNDLED_IMAGE_ARCHIVE"; then
    echo "安裝包內 ERP 映像載入失敗，請重新下載完整 ZIP。"
    pause_exit 1
  fi
  if ! docker_cli image inspect "$ERP_IMAGE" >/dev/null 2>&1; then
    echo "ERP 映像標記與安裝包不一致，請重新下載正確版本。"
    pause_exit 1
  fi
  echo "ERP 公司主機映像已從安裝包載入，不需另外從 GHCR 下載。"
}

install_workstation_app() {`,
    "macOS bundled image loader",
  );
  result = replaceOnce(
    result,
    "ensure_docker\n\nread -r -p",
    "ensure_docker\nverify_bundle_architecture\n\nread -r -p",
    "macOS architecture check",
  );
  result = replaceOnce(
    result,
    "pull_erp_image\ndocker_cli compose",
    "load_bundled_erp_image\ndocker_cli compose",
    "macOS bundled image call",
  );
  return result;
}

function transformWindowsInstaller(source) {
  let result = source;
  result = replaceOnce(
    result,
    'if (Test-Path $ImageTagFile) { $ImageTag = (Get-Content $ImageTagFile -Raw).Trim() }\n',
    'if (Test-Path $ImageTagFile) { $ImageTag = (Get-Content $ImageTagFile -Raw).Trim() }\n'
      + '$BundledImageArchive = Join-Path $PackageDir "images/erin-erp-host-image.tar.gz"\n'
      + '$BundledImageTagFile = Join-Path $PackageDir "bundled-image.txt"\n'
      + '$BundleArchFile = Join-Path $PackageDir "bundle-arch.txt"\n'
      + '$ErpImage = "ghcr.io/erin20080306/erp-inventory-management-copy:$ImageTag"\n'
      + 'if (Test-Path $BundledImageTagFile) { $ErpImage = (Get-Content $BundledImageTagFile -Raw).Trim() }\n',
    "Windows bundled image variables",
  );
  result = replaceOnce(
    result,
    '  return $false\n}\n\nWrite-Host "艾琳 ERP 公司主機 Windows 安裝程式"',
    `  return $false
}

function Assert-BundleArchitecture {
  if (-not (Test-Path $BundleArchFile)) { return }
  $Expected = (Get-Content $BundleArchFile -Raw).Trim().ToLowerInvariant()
  $Actual = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString().ToLowerInvariant()
  if ($Expected -eq "amd64" -and $Actual -ne "x64") {
    throw "這個安裝包只適用 Windows x64。這台電腦是 $Actual，請向艾琳設計索取正確版本"
  }
}

function Import-BundledErpImage([string]$DockerCommand) {
  if (-not (Test-Path $BundledImageArchive)) { return $false }
  Write-Host "載入安裝包內的艾琳 ERP 公司主機映像…" -ForegroundColor Cyan
  & $DockerCommand load --input $BundledImageArchive
  if ($LASTEXITCODE -ne 0) { throw "安裝包內 ERP 映像載入失敗，請重新下載完整 ZIP" }
  & $DockerCommand image inspect $ErpImage *> $null
  if ($LASTEXITCODE -ne 0) { throw "ERP 映像標記與安裝包不一致，請重新下載正確版本" }
  Write-Host "ERP 公司主機映像已從安裝包載入，不需另外從 GHCR 下載。" -ForegroundColor Green
  return $true
}

Write-Host "艾琳 ERP 公司主機 Windows 安裝程式"`,
    "Windows architecture and image loader",
  );
  result = replaceOnce(
    result,
    '$ActivationKey = Read-Host',
    'Assert-BundleArchitecture\n\n$ActivationKey = Read-Host',
    "Windows architecture check",
  );
  result = replaceOnce(
    result,
    "ERP_IMAGE=ghcr.io/erin20080306/erp-inventory-management-copy:$ImageTag",
    "ERP_IMAGE=$ErpImage",
    "Windows bundled image env",
  );
  result = replaceOnce(
    result,
    'Push-Location $InstallDir\ndocker compose --env-file .env.local -f docker-compose.local.yml pull postgres app backup caddy\ndocker compose --env-file .env.local -f docker-compose.local.yml up -d\ndocker compose --env-file .env.local -f docker-compose.local.yml restart caddy\nPop-Location',
    `Push-Location $InstallDir
try {
  if (-not (Import-BundledErpImage $DockerCommand)) {
    Write-Host "安裝包未附 ERP 映像，改從網路下載：$ErpImage" -ForegroundColor Yellow
    & $DockerCommand pull $ErpImage
    if ($LASTEXITCODE -ne 0) { throw "ERP 公司主機映像下載失敗" }
  }
  & $DockerCommand compose --env-file .env.local -f docker-compose.local.yml pull postgres caddy
  if ($LASTEXITCODE -ne 0) { throw "PostgreSQL 或 Caddy 基礎映像下載失敗" }
  & $DockerCommand compose --env-file .env.local -f docker-compose.local.yml up -d
  if ($LASTEXITCODE -ne 0) { throw "公司主機服務啟動失敗" }
  & $DockerCommand compose --env-file .env.local -f docker-compose.local.yml restart caddy
} finally {
  Pop-Location
}`,
    "Windows bundled startup",
  );
  return result;
}

function instructions({ label, architecture, fileName }) {
  const launcher = label.startsWith("Windows") ? "安裝艾琳ERP.bat" : "安裝艾琳ERP.command";
  return `艾琳 ERP 公司主機手動安裝說明
版本：${rawVersion}
安裝包：${fileName}
適用電腦：${label}
ERP 映像架構：${architecture}

本 ZIP 已包含：
1. 艾琳 ERP 公司主機安裝程式
2. 對應此電腦架構的 ERP Docker 映像檔
3. PostgreSQL／Caddy／安全更新器設定
4. 本安裝說明

重要：ZIP 不包含 Docker Desktop。Docker Desktop 由 Docker 官方提供，使用者需自行接受其授權條款。

安裝步驟：
1. 將 ZIP 完整解壓縮，不要直接在壓縮檔預覽視窗內執行。
2. 雙擊「${launcher}」。
3. 若尚未安裝 Docker Desktop，安裝程式會自動顯示提示並開啟 Docker 官方安裝頁。
4. 安裝並開啟 Docker Desktop，完成條款及系統權限設定後，回到原本安裝視窗繼續；不必重新下載 ZIP。
5. 輸入艾琳設計提供的啟用碼。沒有有效啟用碼不會完成公司主機授權與中央登錄。
6. 安裝程式會載入 ZIP 內的 ERP 映像，再下載 PostgreSQL／Caddy 必要基礎映像並啟動公司主機。
7. 等待畫面顯示「安裝完成」、公司代碼、主機網址、管理員帳號與密碼。
8. 請立即保存管理員密碼與備份解密金鑰。

請勿刪除或重新命名：
- images/erin-erp-host-image.tar.gz
- bundled-image.txt
- bundle-arch.txt
- docker-compose.local.yml
- installer、docker、updater 資料夾

網路需求：
- 首次安裝仍需連線中央授權服務驗證啟用碼。
- Docker Desktop、PostgreSQL、Caddy 與工作站 App 仍可能由官方／中央來源下載。
- ERP 主機應用映像已包含在此 ZIP，不需首次安裝時再從 GHCR 下載。

後續更新：
公司管理者可在 ERP「系統設定 → 系統更新中心」按「備份並更新」。更新前會先建立加密備份；不需要重新執行本 ZIP。
`;
}

function prepare({ id, label, architecture, imageArchive, imageTag, fileName }) {
  const target = path.join(stagingDir, id);
  for (const directory of ["installer", "docker", "updater", "images"]) {
    mkdirSync(path.join(target, directory), { recursive: true });
  }
  writeFileSync(path.join(target, "安裝說明.txt"), instructions({ label, architecture, fileName }));
  writeFileSync(path.join(target, "docker-compose.local.yml"), installerCompose());
  cpSync(path.join(root, "docker", "Caddyfile"), path.join(target, "docker", "Caddyfile"));
  cpSync(path.join(root, "updater", "Dockerfile"), path.join(target, "updater", "Dockerfile"));
  cpSync(path.join(root, "updater", "health"), path.join(target, "updater", "health"));
  cpSync(path.join(root, "updater", "update.cgi"), path.join(target, "updater", "update.cgi"));
  cpSync(imageArchive, path.join(target, "images", "erin-erp-host-image.tar.gz"));
  writeFileSync(path.join(target, "image-tag.txt"), "latest\n");
  writeFileSync(path.join(target, "bundled-image.txt"), `${imageTag}\n`);
  writeFileSync(path.join(target, "bundle-arch.txt"), `${architecture}\n`);
  writeFileSync(
    path.join(target, "bundled-image.sha256"),
    `${sha256File(imageArchive)}  images/erin-erp-host-image.tar.gz\n`,
  );
  return target;
}

const definitions = [
  {
    id: "windows-x64",
    platform: "Windows x64",
    label: "Windows 10／11 x64（Intel 或 AMD 64 位元處理器）",
    architecture: "amd64",
    imageArchive: amd64Archive,
    imageTag: amd64ImageTag,
    name: `ErinERP-Host-Windows-x64-${version}.zip`,
  },
  {
    id: "macos-apple-silicon",
    platform: "macOS Apple Silicon",
    label: "macOS Apple Silicon（M1／M2／M3／M4）",
    architecture: "arm64",
    imageArchive: arm64Archive,
    imageTag: arm64ImageTag,
    name: `ErinERP-Host-macOS-Apple-Silicon-${version}.zip`,
  },
  {
    id: "macos-intel",
    platform: "macOS Intel",
    label: "macOS Intel（Intel 處理器 Mac）",
    architecture: "amd64",
    imageArchive: amd64Archive,
    imageTag: amd64ImageTag,
    name: `ErinERP-Host-macOS-Intel-${version}.zip`,
  },
];

const artifacts = definitions.map((definition) => {
  const staging = prepare({ ...definition, fileName: definition.name });
  if (definition.id === "windows-x64") {
    const sourcePath = path.join(root, "installer", "安裝艾琳ERP.ps1");
    const targetPath = path.join(staging, "installer", "Install-ErinERP.ps1");
    cpSync(sourcePath, targetPath);
    const transformed = transformWindowsInstaller(readFileSync(targetPath, "utf8"));
    if (!transformed.startsWith("\uFEFF")) throw new Error("Bundled Windows installer lost its UTF-8 BOM");
    writeFileSync(targetPath, transformed, "utf8");
    writeFileSync(
      path.join(staging, "安裝艾琳ERP.bat"),
      "@echo off\r\nchcp 65001 >nul\r\npowershell.exe -NoProfile -ExecutionPolicy Bypass -File \"%~dp0installer\\Install-ErinERP.ps1\"\r\nif errorlevel 1 pause\r\n",
    );
    writeFileSync(
      path.join(staging, "installer", "Install-ErinERP.bat"),
      "@echo off\r\nchcp 65001 >nul\r\npowershell.exe -NoProfile -ExecutionPolicy Bypass -File \"%~dp0Install-ErinERP.ps1\"\r\nif errorlevel 1 pause\r\n",
    );
  } else {
    const targetPath = path.join(staging, "installer", "Install-ErinERP.command");
    writeFileSync(
      targetPath,
      transformMacInstaller(readFileSync(path.join(root, "installer", "安裝艾琳ERP.command"), "utf8")),
    );
    writeFileSync(
      path.join(staging, "安裝艾琳ERP.command"),
      "#!/bin/bash\nset -e\nSCRIPT_DIR=\"$(cd \"$(dirname \"$0\")\" && pwd)\"\nexec \"$SCRIPT_DIR/installer/Install-ErinERP.command\"\n",
    );
    chmodSync(path.join(staging, "安裝艾琳ERP.command"), 0o755);
    chmodSync(targetPath, 0o755);
    execFileSync("bash", ["-n", targetPath], { stdio: "inherit" });
  }
  return { platform: definition.platform, staging, name: definition.name };
});

for (const artifact of artifacts) {
  const target = path.join(outputDir, artifact.name);
  rmSync(target, { force: true });
  execFileSync("zip", ["-0qr", target, "."], { cwd: artifact.staging, stdio: "inherit" });
}

writeReleaseManifest(outputDir, rawVersion, { desktopSigned: false });
rmSync(stagingDir, { recursive: true, force: true });
console.log(`Bundled Host installers: PASS (${artifacts.map((item) => item.name).join(", ")})`);
