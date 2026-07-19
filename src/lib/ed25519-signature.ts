import {
  createPrivateKey,
  createPublicKey,
  verify as cryptoVerify,
  type KeyObject,
} from "node:crypto";

export type Ed25519SignedEnvelope = {
  payload: Record<string, unknown>;
  signature: string;
  algorithm: string;
};

export function stableSignedJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableSignedJson).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableSignedJson(item)}`)
    .join(",")}}`;
}

function requireEd25519(key: KeyObject, label: string) {
  if (key.asymmetricKeyType !== "ed25519") throw new Error(`${label}必須是 Ed25519 金鑰`);
  return key;
}

function privateSigningKeyFromEnvironment() {
  const privateKeyPem = process.env.LICENSE_ED25519_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const privateKeyB64 = process.env.LICENSE_ED25519_PRIVATE_KEY_B64?.trim();
  if (!privateKeyPem && !privateKeyB64) return null;
  const key = privateKeyPem
    ? createPrivateKey(privateKeyPem)
    : createPrivateKey({ key: Buffer.from(privateKeyB64!, "base64"), format: "der", type: "pkcs8" });
  return requireEd25519(key, "中央授權私鑰");
}

function publicVerificationKey(value: string) {
  const normalized = value.trim();
  const key = normalized.includes("BEGIN PUBLIC KEY")
    ? createPublicKey(normalized.replace(/\\n/g, "\n"))
    : createPublicKey({ key: Buffer.from(normalized, "base64"), format: "der", type: "spki" });
  return requireEd25519(key, "中央授權公鑰");
}

export function currentLicensePublicKeyB64() {
  const privateKey = privateSigningKeyFromEnvironment();
  if (privateKey) {
    return createPublicKey(privateKey).export({ format: "der", type: "spki" }).toString("base64");
  }

  const configured = process.env.LICENSE_ED25519_PUBLIC_KEY_B64?.trim()
    || process.env.LICENSE_ED25519_PUBLIC_KEY?.replace(/\\n/g, "\n").trim();
  if (!configured) throw new Error("授權公鑰尚未設定");
  return publicVerificationKey(configured).export({ format: "der", type: "spki" }).toString("base64");
}

export function verifySignedEnvelopeWithPublicKey(
  envelope: Ed25519SignedEnvelope,
  publicKey: string,
) {
  if (!envelope || envelope.algorithm !== "ed25519") return false;
  try {
    return cryptoVerify(
      null,
      Buffer.from(stableSignedJson(envelope.payload)),
      publicVerificationKey(publicKey),
      Buffer.from(envelope.signature, "base64url"),
    );
  } catch {
    return false;
  }
}
