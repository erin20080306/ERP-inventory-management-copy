import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { validateReleaseEnv } from "./check-release-env.mjs";

const keyPair = generateKeyPairSync("ed25519");
const validEnv = {
  DATABASE_URL: "postgresql://erp:password@db.example.com:5432/erp?sslmode=require",
  NEXTAUTH_URL: "https://erp.example.com",
  NEXTAUTH_SECRET: "n".repeat(32),
  GMAIL_USER: "sender@example.com",
  GMAIL_APP_PASSWORD: "a".repeat(16),
  CONTACT_TO_EMAIL: "owner@example.com",
  LICENSE_ED25519_PRIVATE_KEY_B64: keyPair.privateKey
    .export({ format: "der", type: "pkcs8" })
    .toString("base64"),
  LICENSE_ED25519_PUBLIC_KEY_B64: keyPair.publicKey
    .export({ format: "der", type: "spki" })
    .toString("base64"),
  LICENSE_KEY_SECRET: "k".repeat(32),
  LICENSE_DEVICE_SECRET: "d".repeat(32),
  LICENSE_AUDIT_SECRET: "a".repeat(32),
  INTEGRITY_SECRET: "i".repeat(32),
  CRON_SECRET: "c".repeat(32),
};

assert.deepEqual(validateReleaseEnv(validEnv), { ok: true, missing: [], invalid: [] });

const missing = validateReleaseEnv({});
assert.equal(missing.ok, false);
assert(missing.missing.includes("DATABASE_URL"));
assert(missing.missing.includes("LICENSE_ED25519_PRIVATE_KEY_B64"));

const otherKeyPair = generateKeyPairSync("ed25519");
const mismatched = validateReleaseEnv({
  ...validEnv,
  LICENSE_ED25519_PUBLIC_KEY_B64: otherKeyPair.publicKey
    .export({ format: "der", type: "spki" })
    .toString("base64"),
});
assert(mismatched.invalid.includes("LICENSE_ED25519_KEYPAIR:public-private-mismatch"));

const centralWithLocalSettings = validateReleaseEnv({
  ...validEnv,
  LOCAL_LICENSE_MODE: "true",
  LOCAL_DEVICE_ID: "copied-device",
  LOCAL_INSTALLER_TOKEN: "installer-only-secret",
  BACKUP_ENCRYPTION_KEY: "local-backup-secret",
  HOST_BACKUP_DIR: "/local/backups",
  EINVOICE_PROVIDER: "TURNKEY",
  EINVOICE_ENV: "PRODUCTION",
  EINVOICE_SELLER_TAX_ID: "12345675",
});
assert(centralWithLocalSettings.invalid.includes("LOCAL_LICENSE_MODE:local-only-variable-on-central"));
assert(centralWithLocalSettings.invalid.includes("LOCAL_DEVICE_ID:local-only-variable-on-central"));
assert(centralWithLocalSettings.invalid.includes("LOCAL_INSTALLER_TOKEN:local-only-variable-on-central"));
assert(centralWithLocalSettings.invalid.includes("BACKUP_ENCRYPTION_KEY:local-only-variable-on-central"));
assert(centralWithLocalSettings.invalid.includes("HOST_BACKUP_DIR:local-only-variable-on-central"));
assert(centralWithLocalSettings.invalid.includes("EINVOICE_PROVIDER:local-only-variable-on-central"));
assert(centralWithLocalSettings.invalid.includes("EINVOICE_ENV:local-only-variable-on-central"));
assert(centralWithLocalSettings.invalid.includes("EINVOICE_SELLER_TAX_ID:local-only-variable-on-central"));

console.log("Release configuration validator: PASS");
