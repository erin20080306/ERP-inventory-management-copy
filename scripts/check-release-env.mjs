import { createPrivateKey, createPublicKey } from "node:crypto";
import { pathToFileURL } from "node:url";

const REQUIRED = [
  "DATABASE_URL",
  "NEXTAUTH_URL",
  "NEXTAUTH_SECRET",
  "GMAIL_USER",
  "GMAIL_APP_PASSWORD",
  "CONTACT_TO_EMAIL",
  "LICENSE_ED25519_PRIVATE_KEY_B64",
  "LICENSE_ED25519_PUBLIC_KEY_B64",
  "LICENSE_KEY_SECRET",
  "LICENSE_DEVICE_SECRET",
  "LICENSE_AUDIT_SECRET",
  "INTEGRITY_SECRET",
  "CRON_SECRET",
];

const CENTRAL_ONLY_FORBIDDEN = [
  "CENTRAL_LICENSE_URL",
  "LOCAL_ACTIVATION_KEY",
  "LOCAL_DEVICE_ID",
  "LOCAL_DEVICE_NAME",
  "LOCAL_LICENSE_MODE",
  "LOCAL_INSTALLER_TOKEN",
  "BACKUP_DIR",
  "BACKUP_ENCRYPTION_KEY",
  "BACKUP_RETENTION_DAYS",
  "BACKUP_INTERVAL_HOURS",
  "HOST_BACKUP_DIR",
  "EINVOICE_PROVIDER",
  "EINVOICE_ALLOW_MOCK",
  "EINVOICE_ENV",
  "EINVOICE_MIG_VERSION",
  "EINVOICE_SELLER_TAX_ID",
  "EINVOICE_TURNKEY_OUTBOX_DIR",
  "EINVOICE_TURNKEY_ACK_DIR",
  "EINVOICE_VAN_NAME",
  "EINVOICE_VAN_BASE_URL",
  "EINVOICE_VAN_CLIENT_ID",
  "EINVOICE_VAN_CLIENT_SECRET",
];

const LONG_SECRETS = [
  "NEXTAUTH_SECRET",
  "LICENSE_KEY_SECRET",
  "LICENSE_DEVICE_SECRET",
  "LICENSE_AUDIT_SECRET",
  "INTEGRITY_SECRET",
  "CRON_SECRET",
];

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function addInvalid(invalid, name, reason) {
  invalid.push(`${name}:${reason}`);
}

export function validateReleaseEnv(env) {
  const missing = REQUIRED.filter((name) => !env[name]?.trim());
  const invalid = [];

  if (env.DATABASE_URL) {
    try {
      const url = new URL(env.DATABASE_URL);
      if (!["postgres:", "postgresql:"].includes(url.protocol)) {
        addInvalid(invalid, "DATABASE_URL", "must-use-postgresql");
      }
    } catch {
      addInvalid(invalid, "DATABASE_URL", "invalid-url");
    }
  }

  if (env.NEXTAUTH_URL) {
    try {
      const url = new URL(env.NEXTAUTH_URL);
      if (url.protocol !== "https:") {
        addInvalid(invalid, "NEXTAUTH_URL", "must-use-https");
      }
      if (url.pathname !== "/" || url.search || url.hash) {
        addInvalid(invalid, "NEXTAUTH_URL", "must-be-origin-only");
      }
    } catch {
      addInvalid(invalid, "NEXTAUTH_URL", "invalid-url");
    }
  }

  for (const name of ["GMAIL_USER", "CONTACT_TO_EMAIL"]) {
    if (env[name] && !isEmail(env[name].trim())) {
      addInvalid(invalid, name, "invalid-email");
    }
  }

  if (env.GMAIL_APP_PASSWORD && env.GMAIL_APP_PASSWORD.replace(/\s/g, "").length < 16) {
    addInvalid(invalid, "GMAIL_APP_PASSWORD", "too-short");
  }

  for (const name of LONG_SECRETS) {
    if (env[name] && env[name].length < 32) {
      addInvalid(invalid, name, "too-short");
    }
  }

  for (const name of CENTRAL_ONLY_FORBIDDEN) {
    if (env[name]?.trim()) {
      addInvalid(invalid, name, "local-only-variable-on-central");
    }
  }

  const privateKeyB64 = env.LICENSE_ED25519_PRIVATE_KEY_B64;
  const publicKeyB64 = env.LICENSE_ED25519_PUBLIC_KEY_B64;
  if (privateKeyB64 && publicKeyB64) {
    try {
      const privateKey = createPrivateKey({
        key: Buffer.from(privateKeyB64, "base64"),
        format: "der",
        type: "pkcs8",
      });
      const publicKey = createPublicKey({
        key: Buffer.from(publicKeyB64, "base64"),
        format: "der",
        type: "spki",
      });
      if (privateKey.asymmetricKeyType !== "ed25519" || publicKey.asymmetricKeyType !== "ed25519") {
        addInvalid(invalid, "LICENSE_ED25519_KEYPAIR", "must-be-ed25519");
      } else {
        const derived = createPublicKey(privateKey).export({ format: "der", type: "spki" });
        const configured = publicKey.export({ format: "der", type: "spki" });
        if (!derived.equals(configured)) {
          addInvalid(invalid, "LICENSE_ED25519_KEYPAIR", "public-private-mismatch");
        }
      }
    } catch {
      addInvalid(invalid, "LICENSE_ED25519_KEYPAIR", "invalid-der-base64");
    }
  }

  return {
    ok: missing.length === 0 && invalid.length === 0,
    missing,
    invalid,
  };
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  const result = validateReleaseEnv(process.env);
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}
