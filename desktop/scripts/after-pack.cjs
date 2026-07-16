const { execFileSync } = require("node:child_process");
const path = require("node:path");

/**
 * Electron 套件在 macOS 可能把下載快取的 Finder/provenance xattr 一併複製進 App。
 * 這些屬性會破壞 bundle 簽章並讓 Gatekeeper 顯示「App 已損毀」。
 *
 * 正式版由 electron-builder 在後續階段使用 Developer ID 簽章；本機測試版沒有
 * Apple 憑證，因此在清除 xattr 後補上完整 ad-hoc 簽章。ad-hoc 簽章可驗證 bundle
 * 完整性，但不能取代 Apple notarization，首次開啟仍可能要求使用者右鍵「打開」。
 */
module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") return;

  const appPath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
  );

  execFileSync("xattr", ["-cr", appPath], { stdio: "inherit" });

  if (process.env.CSC_IDENTITY_AUTO_DISCOVERY === "false") {
    execFileSync("codesign", [
      "--force",
      "--deep",
      "--sign",
      "-",
      "--timestamp=none",
      appPath,
    ], { stdio: "inherit" });
    execFileSync("codesign", [
      "--verify",
      "--deep",
      "--strict",
      "--verbose=2",
      appPath,
    ], { stdio: "inherit" });
  }
};
