import { spawnSync } from "node:child_process";

if (process.env.VERCEL !== "1") {
  console.log("Prisma migration deploy skipped outside Vercel.");
  process.exit(0);
}

if (!process.env.DATABASE_URL && process.env.VERCEL_ENV === "preview") {
  console.log("Prisma migration deploy skipped for Vercel Preview without DATABASE_URL.");
  process.exit(0);
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required for Vercel migration deploy.");
  process.exit(1);
}

const command = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(command, ["prisma", "migrate", "deploy"], {
  stdio: "inherit",
  env: process.env,
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
