const fs = require("node:fs");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign: cryptoSign,
  verify: cryptoVerify,
} = require("node:crypto");
const { app, safeStorage } = require("electron");

function log(message, detail = "") {
  const line = `${new Date().toISOString()} ${message}${detail ? ` ${detail}` : ""}\n`;
  try {
    fs.mkdirSync(app.getPath("userData"), { recursive: true });
    fs.appendFileSync(path.join(app.getPath("userData"), "desktop-startup.log"), line);
  } catch {
    process.stderr.write(line);
  }
}

function desktopConfigPath() {
  return path.join(app.getPath("userData"), "desktop-config.json");
}

function hostDirectory() {
  return process.platform === "win32"
    ? path.join(process.env.LOCALAPPDATA || app.getPath("userData"), "ErinERP")
    : path.join(app.getPath("home"), "ErinERP");
}

function dockerBinary() {
  const candidates = process.platform === "darwin"
    ? [
      "/Applications/Docker.app/Contents/Resources/bin/docker",
      "/usr/local/bin/docker",
      "/opt/homebrew/bin/docker",
      path.join(app.getPath("home"), ".docker/bin/docker"),
    ]
    : [
      path.join(process.env.ProgramFiles || "", "Docker", "Docker", "resources", "bin", "docker.exe"),
      "docker.exe",
    ];
  return candidates.find((candidate) => candidate === "docker.exe" || fs.existsSync(candidate)) || null;
}

function deviceIdFromPublicKey(publicKeyB64) {
  const key = createPublicKey({ key: Buffer.from(publicKeyB64, "base64"), format: "der", type: "spki" });
  if (key.asymmetricKeyType !== "ed25519") throw new Error("裝置金鑰格式錯誤");
  const normalized = key.export({ format: "der", type: "spki" });
  return `ERP-WS-${createHash("sha256").update(normalized).digest("base64url")}`;
}

function writeDesktopConfig(config) {
  const target = desktopConfigPath();
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.identity-repair.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, target);
  try { fs.chmodSync(target, 0o600); } catch {}
}

function repairWorkstationIdentity() {
  const target = desktopConfigPath();
  if (!fs.existsSync(target)) return false;
  if (!safeStorage.isEncryptionAvailable()) {
    log("workstation identity repair deferred:", "OS secure storage is unavailable");
    return false;
  }

  const config = JSON.parse(fs.readFileSync(target, "utf8"));
  if (!config.encryptedDevicePrivateKey) return false;

  const privateKey = createPrivateKey({
    key: Buffer.from(safeStorage.decryptString(Buffer.from(config.encryptedDevicePrivateKey, "base64")), "base64"),
    format: "der",
    type: "pkcs8",
  });
  if (privateKey.asymmetricKeyType !== "ed25519") throw new Error("工作站私鑰不是 Ed25519 金鑰");

  const publicKeyObject = createPublicKey(privateKey);
  const publicKey = publicKeyObject.export({ format: "der", type: "spki" }).toString("base64");
  const deviceId = deviceIdFromPublicKey(publicKey);
  const challenge = Buffer.from("ERIN-ERP-WORKSTATION-IDENTITY-CHECK-V1");
  const signature = cryptoSign(null, challenge, privateKey);
  if (!cryptoVerify(null, challenge, publicKeyObject, signature)) {
    throw new Error("工作站裝置金鑰自我驗證失敗");
  }

  if (config.devicePublicKey === publicKey && config.deviceId === deviceId) return false;

  const next = {
    ...config,
    version: Math.max(Number(config.version || 0), 2),
    deviceId,
    devicePublicKey: publicKey,
    identityRepairedAt: new Date().toISOString(),
  };
  delete next.lease;
  delete next.leaseCheckedAt;
  writeDesktopConfig(next);
  log("repaired workstation signing identity:", deviceId);
  return true;
}

function composeArgs(...args) {
  return ["compose", "--env-file", ".env.local", "-f", "docker-compose.local.yml", ...args];
}

function syncResult(command, args, cwd, timeout = 15_000) {
  return spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    timeout,
    windowsHide: true,
  });
}

function updaterState(docker, directory) {
  const listed = syncResult(docker, composeArgs("ps", "-q", "updater"), directory);
  const containerId = String(listed.stdout || "").trim().split(/\s+/)[0] || "";
  if (listed.error || listed.status !== 0 || !containerId) return "missing";

  const inspected = syncResult(docker, [
    "inspect",
    "--format",
    "{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}",
    containerId,
  ], directory);
  if (inspected.error || inspected.status !== 0) return "unknown";
  return String(inspected.stdout || "").trim().toLowerCase() || "unknown";
}

function runAsync(command, args, cwd, timeout = 300_000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("背景更新服務修復逾時"));
    }, timeout);
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (code === 0) return resolve(Buffer.concat(stdout).toString("utf8"));
      reject(new Error(Buffer.concat(stderr).toString("utf8") || Buffer.concat(stdout).toString("utf8") || `Docker 指令失敗 (${code})`));
    });
  });
}

async function repairUpdaterOnce() {
  const directory = hostDirectory();
  if (!fs.existsSync(path.join(directory, ".env.local")) || !fs.existsSync(path.join(directory, "docker-compose.local.yml"))) {
    return "not-installed";
  }
  const docker = dockerBinary();
  if (!docker) return "docker-missing";
  const info = syncResult(docker, ["info"], directory, 10_000);
  if (info.error || info.status !== 0) return "docker-not-ready";

  const state = updaterState(docker, directory);
  if (["healthy", "running"].includes(state)) return "ready";
  if (state === "starting") return "waiting";

  log("repairing background updater:", state);
  await runAsync(docker, composeArgs("up", "-d", "--build", "--force-recreate", "updater"), directory);

  for (let attempt = 0; attempt < 30; attempt += 1) {
    const nextState = updaterState(docker, directory);
    if (["healthy", "running"].includes(nextState)) {
      log("background updater repaired:", nextState);
      return "repaired";
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(`背景更新服務重建後仍未啟動（${updaterState(docker, directory)}）`);
}

function scheduleUpdaterRepair() {
  let attempts = 0;
  let repairing = false;
  const timer = setInterval(() => {
    if (repairing) return;
    attempts += 1;
    repairing = true;
    void repairUpdaterOnce()
      .then((result) => {
        if (["ready", "repaired", "not-installed"].includes(result)) clearInterval(timer);
      })
      .catch((error) => log("background updater repair deferred:", error?.message || String(error)))
      .finally(() => {
        repairing = false;
        if (attempts >= 60) clearInterval(timer);
      });
  }, 5_000);
  timer.unref?.();
}

module.exports = {
  repairWorkstationIdentity,
  scheduleUpdaterRepair,
};
