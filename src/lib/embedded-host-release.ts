import { EMBEDDED_HOST_RELEASE } from "@/generated/embedded-host-installers";

export type EmbeddedHostInstaller = {
  name: string;
  platform: string;
  size: number;
  sha256: string;
  base64: string;
};

type GeneratedRelease = {
  version: string;
  generatedAt: string;
  files: Record<string, EmbeddedHostInstaller>;
};

const release = EMBEDDED_HOST_RELEASE as unknown as GeneratedRelease;

export function getEmbeddedHostReleaseInfo() {
  return { version: release.version, generatedAt: release.generatedAt };
}

export function listEmbeddedHostInstallers() {
  return Object.values(release.files).map((file) => ({
    name: file.name,
    size: file.size,
    updatedAt: release.generatedAt,
    platform: file.platform,
    kind: "company-host" as const,
    sha256: file.sha256,
    codeSigning: "not-applicable",
    downloadUrl: `/api/installers?file=${encodeURIComponent(file.name)}&source=embedded`,
  }));
}

export function getEmbeddedHostInstaller(name: string) {
  const file = release.files[name];
  if (!file) return null;
  const buffer = Buffer.from(file.base64, "base64");
  if (buffer.byteLength !== file.size) throw new Error(`${name} 內嵌安裝包大小驗證失敗`);
  return { ...file, buffer };
}
