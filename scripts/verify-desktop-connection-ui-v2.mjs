import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const setupJs = readFileSync("desktop/setup.js", "utf8");
const setupHtml = readFileSync("desktop/setup.html", "utf8");
const packageJson = JSON.parse(readFileSync("desktop/package.json", "utf8"));
const workflow = readFileSync(".github/workflows/publish-macos-workstation-v1-0-3.yml", "utf8");

execFileSync(process.execPath, ["--check", "desktop/setup.js"], { stdio: "pipe" });

assert.match(setupJs, /hasAttemptedConnection/);
assert.match(setupJs, /Error invoking remote method/);
assert.match(setupJs, /公司主機尚未安裝完成/);
assert.match(setupJs, /if \(!hasAttemptedConnection\) return/);
assert.match(setupJs, /clearStoredConnection/);
assert.match(setupHtml, /id="clearButton"/);
assert.match(setupHtml, /清除舊連線設定/);
assert.equal(packageJson.version, "1.0.2");

for (const scriptName of ["dist:mac", "dist:mac:manual", "dist:mac:test", "dist:win", "dist:win:manual", "dist:win:test"]) {
  assert.match(packageJson.scripts[scriptName], /--publish=never/, `${scriptName} 必須以 --publish=never 停用 electron-builder CI 自動發布`);
}

assert.match(workflow, /cd desktop/);
assert.match(workflow, /\.\/node_modules\/\.bin\/electron-builder/);
assert.match(workflow, /--publish=never/);
assert.match(workflow, /--dir/);
assert.match(workflow, /unset GH_TOKEN GITHUB_TOKEN/);
assert.match(workflow, /if ! \(/);
assert.doesNotMatch(workflow, /PIPESTATUS/);
assert.match(workflow, /electron-builder 最後回傳非零狀態/);
assert.match(workflow, /cat "\$build_output\/electron-builder\.log"/);
assert.match(workflow, /if \[ ! -d "\$app_path" \]/);
assert.match(workflow, /workflow\.log/);
assert.match(workflow, /ditto -c -k --sequesterRsrc --keepParent/);
assert.match(workflow, /hdiutil create/);
assert.match(workflow, /actions\/upload-artifact@v4/);
assert.match(workflow, /if: always\(\)/);
assert.match(workflow, /electron-builder\.log/);
assert.match(workflow, /ErinERP-Desktop-macOS-arm64\.dmg/);
assert.match(workflow, /notarytool submit/);
assert.match(workflow, /codesign --verify/);
assert.match(workflow, /cancel-in-progress: true/);
assert.match(workflow, /RELEASE_TAG: v1\.0\.3-desktop/);

console.log("Desktop connection UI and stable macOS shell workflow: PASS");
