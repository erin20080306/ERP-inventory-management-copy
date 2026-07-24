import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const script = "scripts/deploy-vercel-migrations.mjs";

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
assert.match(local.stdout, /skipped outside Vercel/);

const preview = run({ VERCEL: "1", VERCEL_ENV: "preview" });
assert.equal(preview.status, 0);
assert.match(preview.stdout, /Preview without DATABASE_URL/);

const production = run({ VERCEL: "1", VERCEL_ENV: "production" });
assert.equal(production.status, 1);
assert.match(production.stderr, /DATABASE_URL is required/);

console.log("Vercel Preview migration guard and Production enforcement: PASS");
