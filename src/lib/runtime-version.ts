const VERSION_PATTERN = /^(?:[a-f0-9]{7,64}|development)$/i;

function normalizeVersion(value: unknown) {
  const candidate = String(value || "development").trim();
  return VERSION_PATTERN.test(candidate) ? candidate : "development";
}

export function currentHostVersion() {
  return normalizeVersion(process.env.ERIN_RELEASE_SHA);
}

export function currentRuntimeVersion() {
  return normalizeVersion(process.env.VERCEL_GIT_COMMIT_SHA || process.env.ERIN_RELEASE_SHA);
}
