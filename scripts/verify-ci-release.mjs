import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

function read(path) {
  return readFileSync(path, "utf8");
}

const ci = read(".github/workflows/ci.yml");
const hostWorkflow = read(".github/workflows/publish-host-container-image.yml");
const releaseRoute = read("src/app/api/releases/current/route.ts");
const hostUpdate = read("src/lib/host-update.ts");
const updater = read("updater/update.cgi");
const dockerfile = read("Dockerfile");
const middleware = read("src/middleware.ts");
const desktopPackage = read("desktop/package.json");
const desktopSecurity = read("desktop/security-bootstrap.cjs");
const outboxMigration = read("prisma/migrations/20260726093000_storefront_sync_outbox/migration.sql");
const outboxLibrary = read("src/lib/storefront-sync-outbox.ts");

assert.match(ci, /permissions:\s*\n\s*contents: read/);
assert.doesNotMatch(ci, /git push|contents: write/);
assert.match(ci, /npx prisma validate/);
assert.match(ci, /npx tsc --noEmit/);

for (const removed of [
  ".speed-optimization-trigger",
  ".github/workflows/apply-speed-optimizations.yml",
  "scripts/apply-pos-fast-checkout-v5.mjs",
  "scripts/fix-pos-fast-checkout-v6.mjs",
  "scripts/fix-restaurant-order-queue-v7.mjs",
]) {
  assert.equal(existsSync(removed), false, `一次性 patch 檔仍存在：${removed}`);
}
assert.ok(existsSync("scripts/verify-speed-patch.mjs"));
assert.ok(existsSync("scripts/verify-pos-fast-checkout-v5.mjs"));

assert.match(hostWorkflow, /Capture immutable candidate Digest/);
assert.match(hostWorkflow, /--format '\{\{json \.Manifest\}\}'/);
assert.match(hostWorkflow, /JSON\.parse/);
assert.match(hostWorkflow, /Record released Host image version and Digest/);
assert.match(hostWorkflow, /digest: \\"\$RELEASE_DIGEST\\"/);
assert.match(releaseRoute, /imageDigest/);
assert.match(releaseRoute, /immutableImage/);
assert.match(hostUpdate, /X-Erin-Image-Digest/);
assert.match(hostUpdate, /DIGEST_PATTERN/);
assert.match(updater, /HTTP_X_ERIN_IMAGE_DIGEST/);
assert.match(updater, /target_image="\$\{IMAGE_REPOSITORY\}@\$\{image_digest\}"/);
assert.match(updater, /write_env_image "\$target_image"/);

assert.match(outboxMigration, /CREATE TABLE IF NOT EXISTS "StorefrontSyncOutbox"/);
assert.match(outboxMigration, /FOR EACH ROW/);
assert.match(outboxMigration, /SystemSetting_storefront_outbox_bridge/);
assert.match(outboxLibrary, /FOR UPDATE SKIP LOCKED/);
assert.match(outboxLibrary, /retryStorefrontStatusOutbox/);

assert.match(dockerfile, /FROM base AS production-deps/);
assert.match(dockerfile, /FROM base AS runtime-tools/);
assert.match(dockerfile, /COPY --from=build \/app\/\.next \.\/\.next/);
assert.doesNotMatch(dockerfile, /COPY --from=build \/app \.\//);

assert.match(desktopPackage, /"main": "security-bootstrap\.cjs"/);
assert.match(desktopSecurity, /app\.enableSandbox\(\)/);
assert.match(desktopSecurity, /will-attach-webview/);
assert.match(desktopSecurity, /require\("\.\/v107-bootstrap\.cjs"\)/);
assert.ok(existsSync("docs/ELECTRON_SECURITY_REVIEW.md"));
assert.ok(existsSync("docs/DECIMAL_PRECISION_AUDIT.md"));
assert.ok(existsSync("docs/RELEASE_ENGINEERING.md"));

assert.match(middleware, /isTenantPublicProtectedPath/);
assert.doesNotMatch(middleware, /tenantSlug && !\/\\\.\[\^\/\]\+\$\/\.test\(pathname\)/);

console.log("Read-only CI, removable patches, Digest release, Outbox, Electron and Docker safeguards: PASS");
