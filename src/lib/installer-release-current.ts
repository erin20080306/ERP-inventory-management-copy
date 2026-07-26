import {
  getInstallerRelease as getBaseInstallerRelease,
  getPrivateInstallerBlob,
  INSTALLER_METADATA,
  INSTALLER_NAME,
  type InstallerRelease,
} from "./installer-release";
import { getEmbeddedHostReleaseInfo, listEmbeddedHostInstallers } from "./embedded-host-release";
import { getPreferredGithubHostRelease } from "./github-host-release";
import { getPreferredGithubWorkstationRelease } from "./github-workstation-release";

export { getPrivateInstallerBlob, INSTALLER_METADATA, INSTALLER_NAME };

function isCustomerInstallable(codeSigning: string | null) {
  return codeSigning === "signed" || codeSigning === "ad-hoc-manual";
}

export async function getInstallerRelease(options: { allowPrerelease: boolean; localFallback?: boolean }) {
  let preferredWorkstations: InstallerRelease | null = null;
  try {
    preferredWorkstations = await getPreferredGithubWorkstationRelease();
  } catch (error) {
    console.error("[installer-release] repaired workstation release lookup failed", error);
  }

  let preferredHosts: Awaited<ReturnType<typeof getPreferredGithubHostRelease>> = null;
  try {
    preferredHosts = await getPreferredGithubHostRelease();
  } catch (error) {
    console.error("[installer-release] bundled Host release lookup failed", error);
  }

  const base = await getBaseInstallerRelease(options);
  let release: InstallerRelease | null = preferredWorkstations ?? base;
  if (preferredWorkstations && base) {
    const filesByName = new Map(
      base.files
        .filter((file) => file.kind === "workstation" && !/macos/i.test(file.name))
        .map((file) => [file.name, file]),
    );
    for (const file of preferredWorkstations.files.filter((item) => item.kind === "workstation")) {
      filesByName.set(file.name, file);
    }
    const workstations = [...filesByName.values()];
    release = {
      ...preferredWorkstations,
      prefix: base.prefix,
      files: workstations,
      readyForCustomers: workstations.length > 0 && workstations.every((file) => isCustomerInstallable(file.codeSigning)),
    };
  }
  if (!release) return null;

  const fallbackHosts = listEmbeddedHostInstallers();
  const hostFiles = preferredHosts?.files.length ? preferredHosts.files : fallbackHosts;
  if (!hostFiles.length) return release;
  const embeddedInfo = getEmbeddedHostReleaseInfo();

  return {
    ...release,
    version: preferredHosts?.version ?? release.version ?? embeddedInfo.version,
    generatedAt: preferredHosts?.generatedAt ?? release.generatedAt ?? embeddedInfo.generatedAt,
    prerelease: release.prerelease || Boolean(preferredHosts?.prerelease),
    files: [...release.files.filter((file) => file.kind !== "company-host"), ...hostFiles],
    metadata: {
      ...release.metadata,
      ...(preferredHosts?.metadata ?? {}),
    },
  } satisfies InstallerRelease;
}
