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
assert.match(currentRelease, /getPreferredGithubWorkstationRelease/);
assert.match(githubRelease, /v1\.0\.3-desktop/);
assert.match(workflow, /ErinERP-Desktop-macOS-arm64\.dmg/);
assert.match(workflow, /notarytool submit/);
assert.match(workflow, /codesign --verify/);

console.log("Desktop friendly setup and macOS publishing: PASS");
