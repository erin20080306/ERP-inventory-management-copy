import { createHash } from "node:crypto";
import { closeSync, openSync, readFileSync, readSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const INSTALLER_PATTERN = /^ErinERP-(?:Host|Desktop)-[A-Za-z0-9._-]+\.(?:dmg|zip|exe)$/i;

export function sha256File(filePath) {
  const hash = createHash("sha256");
  const handle = openSync(filePath, "r");
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    let bytesRead = 0;
    do {
      bytesRead = readSync(handle, buffer, 0, buffer.length, null);
      if (bytesRead > 0) hash.update(buffer.subarray(0, bytesRead));
    } while (bytesRead > 0);
  } finally {
    closeSync(handle);
  }
  return hash.digest("hex");
}

export function writeReleaseManifest(outputDir, version, options = {}) {
  const names = readdirSync(outputDir).filter((name) => INSTALLER_PATTERN.test(name)).sort();
  const artifacts = names.map((name) => {
    const fullPath = path.join(outputDir, name);
    const kind = name.startsWith("ErinERP-Host-") ? "company-host" : "workstation";
    const architecture = /apple-silicon|arm64/i.test(name)
      ? "arm64"
      : /windows-x64|macos-intel|x64/i.test(name)
        ? "x64"
        : "all";
    return {
      name,
      kind,
      platform: /windows/i.test(name) ? "Windows" : /macos/i.test(name) ? "macOS" : "unknown",
      architecture,
      size: statSync(fullPath).size,
      sha256: sha256File(fullPath),
      codeSigning: kind === "workstation"
        ? options.desktopSigned
          ? "signed"
          : options.manualInstall
            ? "ad-hoc-manual"
            : "unsigned-test"
        : "not-applicable",
      requiresDockerDesktop: kind === "company-host",
      includesBundledHostImage: kind === "company-host" && /windows-x64|apple-silicon|macos-intel/i.test(name),
    };
  });
  const manifest = {
    schema: "erin-erp-release-manifest-v1",
    version,
    generatedAt: new Date().toISOString(),
    artifacts,
  };
  writeFileSync(path.join(outputDir, "release-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(path.join(outputDir, "SHA256SUMS.txt"), `${artifacts.map((item) => `${item.sha256}  ${item.name}`).join("\n")}\n`);
  return manifest;
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  const outputDir = path.resolve(process.argv[2] || "dist/desktop");
  const packageJson = JSON.parse(readFileSync(path.resolve("package.json"), "utf8"));
  const version = process.argv[3] || process.env.GITHUB_REF_NAME || `v${packageJson.version}-local`;
  const manifest = writeReleaseManifest(outputDir, version, {
    desktopSigned: process.env.RELEASE_SIGNED === "true",
    manualInstall: process.env.RELEASE_MANUAL === "true",
  });
  console.log(`Release manifest: PASS (${manifest.artifacts.length} artifacts)`);
}
