import {
  getInstallerRelease as getBaseInstallerRelease,
  getPrivateInstallerBlob,
  INSTALLER_METADATA,
  INSTALLER_NAME,
  type InstallerRelease,
} from "./installer-release";
import { getEmbeddedHostReleaseInfo, listEmbeddedHostInstallers } from "./embedded-host-release";

export { getPrivateInstallerBlob, INSTALLER_METADATA, INSTALLER_NAME };

export async function getInstallerRelease(options: { allowPrerelease: boolean; localFallback?: boolean }) {
  const release = await getBaseInstallerRelease(options);
  if (!release) return null;

  const hosts = listEmbeddedHostInstallers();
  if (!hosts.length) return release;
  const info = getEmbeddedHostReleaseInfo();

  return {
    ...release,
    version: info.version,
    generatedAt: info.generatedAt,
    files: [...release.files.filter((file) => file.kind !== "company-host"), ...hosts],
  } satisfies InstallerRelease;
}
