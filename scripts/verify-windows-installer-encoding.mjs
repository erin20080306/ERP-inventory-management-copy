import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { inflateRawSync } from "node:zlib";

const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf]);
const installerPath = path.resolve("installer/安裝艾琳ERP.ps1");

function assertStartsWithUtf8Bom(buffer, label) {
  assert.ok(buffer.subarray(0, UTF8_BOM.length).equals(UTF8_BOM), `${label} must start with a UTF-8 BOM`);
  assert.ok(!buffer.subarray(UTF8_BOM.length, UTF8_BOM.length * 2).equals(UTF8_BOM), `${label} must contain exactly one UTF-8 BOM`);
}

function normalizedPowerShellText(buffer) {
  return buffer.subarray(UTF8_BOM.length).toString("utf8").replace(/\r\n?/g, "\n");
}

function readZipEntry(archive, targetName) {
  let offset = 0;
  while (offset + 30 <= archive.length && archive.readUInt32LE(offset) === 0x04034b50) {
    const flags = archive.readUInt16LE(offset + 6);
    const method = archive.readUInt16LE(offset + 8);
    const compressedSize = archive.readUInt32LE(offset + 18);
    const uncompressedSize = archive.readUInt32LE(offset + 22);
    const nameLength = archive.readUInt16LE(offset + 26);
    const extraLength = archive.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const dataEnd = dataStart + compressedSize;
    const name = archive.subarray(nameStart, nameStart + nameLength).toString("utf8");

    assert.equal(flags & 0x0008, 0, `ZIP entry ${name} must record its size in the local header`);
    assert.ok(dataEnd <= archive.length, `ZIP entry ${name} exceeds the archive boundary`);

    if (name === targetName) {
      const compressed = archive.subarray(dataStart, dataEnd);
      const content = method === 0 ? compressed : method === 8 ? inflateRawSync(compressed) : null;
      assert.ok(content, `ZIP entry ${name} uses unsupported compression method ${method}`);
      assert.equal(content.length, uncompressedSize, `ZIP entry ${name} has an invalid uncompressed size`);
      return content;
    }

    offset = dataEnd;
  }
  throw new Error(`ZIP entry not found: ${targetName}`);
}

const sourceInstaller = readFileSync(installerPath);
assertStartsWithUtf8Bom(sourceInstaller, "Windows Host source installer");
const sourceInstallerText = normalizedPowerShellText(sourceInstaller);
assert.match(sourceInstallerText, /docs\.docker\.com\/desktop\/setup\/install\/windows-install/);
assert.match(sourceInstallerText, /Start-Process -FilePath \$DockerDocsUrl/);
assert.match(sourceInstallerText, /function Start-DockerDesktop/);
assert.match(sourceInstallerText, /function Wait-ForDockerDesktop/);
assert.match(sourceInstallerText, /Read-Host "Docker Desktop 已安裝後，按 Enter 繼續"/);

const generatedModule = readFileSync("src/generated/embedded-host-installers.ts", "utf8");
const generatedPrefix = "export const EMBEDDED_HOST_RELEASE = ";
const generatedStart = generatedModule.indexOf(generatedPrefix);
assert.notEqual(generatedStart, -1, "Embedded Host release export is missing");
const generatedJson = generatedModule
  .slice(generatedStart + generatedPrefix.length)
  .replace(/\s+as const;\s*$/, "");
const embeddedRelease = JSON.parse(generatedJson);
const embeddedWindows = Object.values(embeddedRelease.files).find((file) => file.name.includes("-Windows-"));
assert.ok(embeddedWindows, "Embedded Windows Host installer is missing");
const embeddedArchive = Buffer.from(embeddedWindows.base64, "base64");
const embeddedInstaller = readZipEntry(embeddedArchive, "installer/Install-ErinERP.ps1");
assertStartsWithUtf8Bom(embeddedInstaller, "Vercel embedded Windows Host installer");
assert.equal(
  normalizedPowerShellText(embeddedInstaller),
  normalizedPowerShellText(sourceInstaller),
  "Vercel embedded installer must preserve the source PowerShell text apart from platform line endings",
);

const releaseBuilder = readFileSync("scripts/build-host-installers.mjs", "utf8");
assert.match(
  releaseBuilder,
  /cpSync\(path\.join\(root, "installer", "安裝艾琳ERP\.ps1"\), path\.join\(windows, "installer", "Install-ErinERP\.ps1"\)\)/,
  "GitHub Release builder must copy the BOM-preserving source bytes",
);
assert.match(
  releaseBuilder,
  /const imageTag = process\.argv\[3\] \|\| "latest";/,
  "Tagged manual Host installers must pull the smoke-tested latest image unless an explicit image tag is supplied",
);

if (process.platform === "win32") {
  execFileSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-Command",
      '$tokens=$null; $errors=$null; [System.Management.Automation.Language.Parser]::ParseFile($env:ERIN_INSTALLER_PATH,[ref]$tokens,[ref]$errors)|Out-Null; if($errors.Count){$errors|ForEach-Object{$_.Message}; exit 1}',
    ],
    {
      env: { ...process.env, ERIN_INSTALLER_PATH: installerPath },
      stdio: "pipe",
    },
  );
}

console.log("Windows PowerShell 5.1 BOM, Vercel embedded ZIP, and GitHub Release copy path: PASS");