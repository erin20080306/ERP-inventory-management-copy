import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const INSTALLER_PATTERN = /^ErinERP-(?:Host|Desktop)-[A-Za-z0-9._-]+\.(?:dmg|zip|exe)$/i;

export function writeReleaseManifest(outputDir, version, options = {}) {
  const names = readdirSync(outputDir).filter((name) => INSTALLER_PATTERN.test(name)).sort();
  const artifacts = names.map((name) => {
    const fullPath = path.join(outputDir, name);
    const content = readFileSync(fullPath);
    const kind = name.startsWith("ErinERP-Host-") ? "company-host" : "workstation";
    return {
      name,
      kind,
      platform: /windows/i.test(name) ? "Windows" : /macos/i.test(name) ? "macOS" : "unknown",
      architecture: /arm64/i.test(name) ? "arm64" : /x64/i.test(name) ? "x64" : "all",
      size: statSync(fullPath).size,
      sha256: createHash("sha256").update(content).digest("hex"),
      codeSigning: kind === "workstation" ? (options.desktopSigned ? "signed" : "unsigned-test") : "not-applicable",
      requiresDockerDesktop: kind === "company-host",
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
  const manifest = writeReleaseManifest(outputDir, version, { desktopSigned: process.env.RELEASE_SIGNED === "true" });
  console.log(`Release manifest: PASS (${manifest.artifacts.length} artifacts)`);
}
