import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const script = "scripts/deploy-vercel-migrations.mjs";
// 斷言須對齊 deploy 腳本實際輸出的中文訊息（該腳本的 build log 一直是中文）。

function run(env) {
  return spawnSync(process.execPath, [script], {
    encoding: "utf8",
    env: {
      PATH: process.env.PATH,
      SystemRoot: process.env.SystemRoot,
      ...env,
    },
  });
}

const local = run({});
assert.equal(local.status, 0);
assert.match(local.stdout, /非 Vercel 環境/);

const preview = run({ VERCEL: "1", VERCEL_ENV: "preview" });
assert.equal(preview.status, 0);
assert.match(preview.stdout, /Preview 無 DATABASE_URL/);

const production = run({ VERCEL: "1", VERCEL_ENV: "production" });
assert.equal(production.status, 1);
assert.match(production.stderr, /缺少 DATABASE_URL/);

console.log("Vercel Preview migration guard and Production enforcement: PASS");
