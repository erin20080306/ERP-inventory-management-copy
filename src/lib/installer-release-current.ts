import {
  getInstallerRelease as getBaseInstallerRelease,
  getPrivateInstallerBlob,
  INSTALLER_METADATA,
  INSTALLER_NAME,
  type InstallerRelease,
} from "./installer-release";
import { getEmbeddedHostReleaseInfo, listEmbeddedHostInstallers } from "./embedded-host-release";
import { getPreferredGithubWorkstationRelease } from "./github-workstation-release";

export { getPrivateInstallerBlob, INSTALLER_METADATA, INSTALLER_NAME };

export async function getInstallerRelease(options: { allowPrerelease: boolean; localFallback?: boolean }) {
  let preferred: InstallerRelease | null = null;
  try {
    preferred = await getPreferredGithubWorkstationRelease();
  } catch (error) {
    console.error("[installer-release] repaired workstation release lookup failed", error);
  }

  const release = preferred ?? await getBaseInstallerRelease(options);
  if (!release) return null;

  const hosts = listEmbeddedHostInstallers();
  if (!hosts.length) return release;
  const info = getEmbeddedHostReleaseInfo();

  return {
    ...release,
    version: release.version ?? info.version,
    generatedAt: release.generatedAt ?? info.generatedAt,
    files: [...release.files.filter((file) => file.kind !== "company-host"), ...hosts],
  } satisfies InstallerRelease;
}
