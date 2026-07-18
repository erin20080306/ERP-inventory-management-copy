import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const mac = readFileSync("installer/安裝艾琳ERP.command", "utf8");
const windows = readFileSync("installer/安裝艾琳ERP.ps1", "utf8");
const guide = readFileSync("installer/主機安裝說明.txt", "utf8");
const generator = readFileSync("scripts/generate-embedded-host-installers.mjs", "utf8");
const builder = readFileSync("scripts/build-host-installers.mjs", "utf8");

execFileSync("bash", ["-n", "installer/安裝艾琳ERP.command"], { stdio: "pipe" });

assert.match(mac, /同一台 Mac 可以同時安裝/);
assert.match(mac, /DOCKER_DOCS_URL/);
assert.match(mac, /open -ga Docker/);
assert.match(mac, /回到這個視窗按 Enter/);
assert.match(mac, /docker_cli compose/);
assert.match(windows, /同一台 Windows 電腦可以同時安裝/);
assert.match(windows, /DockerDocsUrl/);
assert.match(windows, /Start-DockerDesktop/);
assert.match(windows, /Wait-DockerReady/);
assert.match(guide, /公司主機與工作站可裝在同一台電腦/);
assert.match(generator, /v1\.0\.3-assisted/);
assert.match(generator, /安裝艾琳ERP\.command/);
assert.match(generator, /安裝艾琳ERP\.bat/);
assert.match(generator, /主機安裝說明\.txt/);
assert.match(builder, /path\.join\(mac, "安裝艾琳ERP\.command"\)/);
assert.match(builder, /path\.join\(windows, "安裝艾琳ERP\.bat"\)/);

console.log("Assisted Host installers: PASS");
