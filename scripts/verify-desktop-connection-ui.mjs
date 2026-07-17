import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const setupJs = readFileSync("desktop/setup.js", "utf8");
const setupHtml = readFileSync("desktop/setup.html", "utf8");
const packageJson = JSON.parse(readFileSync("desktop/package.json", "utf8"));
const currentRelease = readFileSync("src/lib/installer-release-current.ts", "utf8");
const githubRelease = readFileSync("src/lib/github-workstation-release.ts", "utf8");
const workflow = readFileSync(".github/workflows/publish-macos-workstation-v1-0-3.yml", "utf8");

execFileSync(process.execPath, ["--check", "desktop/setup.js"], { stdio: "pipe" });

assert.match(setupJs, /hasAttemptedConnection/);
assert.match(setupJs, /Error invoking remote method/);
assert.match(setupJs, /公司主機尚未安裝完成/);
assert.match(setupJs, /if \(!hasAttemptedConnection\) return/);
assert.match(setupJs, /clearStoredConnection/);
assert.match(setupHtml, /id="clearButton"/);
assert.match(setupHtml, /清除舊連線設定/);
assert.equal(packageJson.version, "1.0.1");
for (const scriptName of ["dist:mac", "dist:mac:manual", "dist:mac:test", "dist:win", "dist:win:manual", "dist:win:test"]) {
  assert.match(packageJson.scripts[scriptName], /--publish never/, `${scriptName} 必須停用 electron-builder CI 自動發布`);
}
assert.match(currentRelease, /getPreferredGithubWorkstationRelease/);
assert.match(githubRelease, /v1\.0\.3-desktop/);
assert.match(workflow, /ErinERP-Desktop-macOS-arm64\.dmg/);
assert.match(workflow, /notarytool submit/);
assert.match(workflow, /codesign --verify/);
assert.match(workflow, /cancel-in-progress: true/);

console.log("Desktop friendly setup and macOS publishing: PASS");
