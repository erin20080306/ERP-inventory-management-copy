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

function isCustomerInstallable(codeSigning: string | null) {
  return codeSigning === "signed" || codeSigning === "ad-hoc-manual";
}

export async function getInstallerRelease(options: { allowPrerelease: boolean; localFallback?: boolean }) {
  let preferred: InstallerRelease | null = null;
  try {
    preferred = await getPreferredGithubWorkstationRelease();
  } catch (error) {
    console.error("[installer-release] repaired workstation release lookup failed", error);
  }

  const base = await getBaseInstallerRelease(options);
  let release: InstallerRelease | null = preferred ?? base;
  if (preferred && base) {
    const filesByName = new Map(
      base.files
        .filter((file) => file.kind === "workstation" && !/macos/i.test(file.name))
        .map((file) => [file.name, file]),
    );
    for (const file of preferred.files.filter((item) => item.kind === "workstation")) {
      filesByName.set(file.name, file);
    }
    const workstations = [...filesByName.values()];
    release = {
      ...preferred,
      prefix: base.prefix,
      files: workstations,
      readyForCustomers: workstations.length > 0 && workstations.every((file) => isCustomerInstallable(file.codeSigning)),
    };
  }
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
