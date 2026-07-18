import type { InstallerFile, InstallerRelease } from "./installer-release";

const REPOSITORY = "erin20080306/ERP-inventory-management-copy";
const WORKSTATION_RELEASE_TAG = "v1.0.5-desktop";

type GithubAsset = {
  name: string;
  size: number;
  updated_at: string;
  browser_download_url: string;
};

type GithubRelease = {
  tag_name: string;
  published_at: string | null;
  prerelease: boolean;
  draft: boolean;
  assets: GithubAsset[];
};

type Manifest = {
  version?: string;
  generatedAt?: string;
  artifacts?: Array<{
    name: string;
    sha256?: string;
    codeSigning?: string;
    platform?: string;
  }>;
};

function platformLabel(name: string) {
  if (/windows.*x64/i.test(name)) return "Windows x64（一般 Windows 電腦）";
  if (/macos.*arm64/i.test(name)) return "macOS Apple Silicon";
  if (/macos/i.test(name)) return "macOS";
  return "其他";
}

function customerInstallable(file: InstallerFile) {
  return file.codeSigning === "signed" || file.codeSigning === "ad-hoc-manual";
}

export async function getPreferredGithubWorkstationRelease(): Promise<InstallerRelease | null> {
  const api = `https://api.github.com/repos/${REPOSITORY}/releases/tags/${WORKSTATION_RELEASE_TAG}`;
  const response = await fetch(api, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "ErinERP-Installer-Release",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    next: { revalidate: 60 },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`macOS 工作站 Release 讀取失敗 (${response.status})`);

  const release = await response.json() as GithubRelease;
  if (release.draft) return null;
  const assets = release.assets ?? [];
  const manifestAsset = assets.find((asset) => asset.name === "release-manifest.json");
  let manifest: Manifest | null = null;
  if (manifestAsset) {
    const manifestResponse = await fetch(manifestAsset.browser_download_url, {
      headers: { "User-Agent": "ErinERP-Installer-Release" },
      next: { revalidate: 60 },
    });
    if (manifestResponse.ok) manifest = await manifestResponse.json() as Manifest;
  }

  const manifestItems = new Map((manifest?.artifacts ?? []).map((item) => [item.name, item]));
  const files: InstallerFile[] = assets
    .filter((asset) => /^ErinERP-Desktop-[A-Za-z0-9._-]+\.(?:dmg|zip|exe)$/i.test(asset.name))
    .map((asset) => {
      const item = manifestItems.get(asset.name);
      return {
        name: asset.name,
        size: asset.size,
        updatedAt: asset.updated_at,
        platform: item?.platform || platformLabel(asset.name),
        kind: "workstation" as const,
        sha256: item?.sha256 ?? null,
        codeSigning: item?.codeSigning ?? null,
        downloadUrl: asset.browser_download_url,
      };
    });
  if (!files.length || !files.every(customerInstallable)) return null;

  const metadata = Object.fromEntries(
    assets
      .filter((asset) => /^(?:release-manifest\.json|SHA256SUMS\.txt)$/.test(asset.name))
      .map((asset) => [asset.name, asset.browser_download_url]),
  );

  return {
    version: manifest?.version || release.tag_name,
    generatedAt: manifest?.generatedAt || release.published_at || undefined,
    prerelease: release.prerelease,
    readyForCustomers: true,
    storage: "github",
    files,
    metadata,
  };
}
