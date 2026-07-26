import type { InstallerFile } from "./installer-release";

const REPOSITORY = "erin20080306/ERP-inventory-management-copy";
const HOST_PATTERN = /^ErinERP-Host-(?:Windows-x64|macOS-Apple-Silicon|macOS-Intel)-[A-Za-z0-9._-]+\.zip$/i;

export type GithubHostRelease = {
  version?: string;
  generatedAt?: string;
  prerelease: boolean;
  files: InstallerFile[];
  metadata: Record<string, string>;
};

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
    includesBundledHostImage?: boolean;
  }>;
};

function platformLabel(name: string) {
  if (/Windows-x64/i.test(name)) return "Windows x64 公司主機（內含 ERP 映像）";
  if (/Apple-Silicon/i.test(name)) return "macOS Apple Silicon 公司主機（M1／M2／M3／M4，內含 ERP 映像）";
  if (/macOS-Intel/i.test(name)) return "macOS Intel 公司主機（內含 ERP 映像）";
  return "公司主機";
}

function completeHostSet(files: InstallerFile[]) {
  return files.some((file) => /Windows-x64/i.test(file.name))
    && files.some((file) => /Apple-Silicon/i.test(file.name))
    && files.some((file) => /macOS-Intel/i.test(file.name));
}

async function releaseManifest(asset: GithubAsset | undefined) {
  if (!asset) return null;
  const response = await fetch(asset.browser_download_url, {
    headers: { "User-Agent": "ErinERP-Installer-Release" },
    next: { revalidate: 60 },
  });
  return response.ok ? await response.json() as Manifest : null;
}

export async function getPreferredGithubHostRelease(): Promise<GithubHostRelease | null> {
  const response = await fetch(`https://api.github.com/repos/${REPOSITORY}/releases?per_page=20`, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "ErinERP-Installer-Release",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    next: { revalidate: 60 },
  });
  if (!response.ok) throw new Error(`Host Release 讀取失敗 (${response.status})`);

  const releases = await response.json() as GithubRelease[];
  for (const release of releases) {
    if (release.draft) continue;
    const assets = release.assets ?? [];
    const hostAssets = assets.filter((asset) => HOST_PATTERN.test(asset.name));
    if (hostAssets.length < 3) continue;

    const manifestAsset = assets.find((asset) => asset.name === "release-manifest.json");
    const manifest = await releaseManifest(manifestAsset);
    const manifestItems = new Map((manifest?.artifacts ?? []).map((item) => [item.name, item]));
    const files = hostAssets.map((asset) => {
      const item = manifestItems.get(asset.name);
      return {
        name: asset.name,
        size: asset.size,
        updatedAt: asset.updated_at,
        platform: item?.platform || platformLabel(asset.name),
        kind: "company-host" as const,
        sha256: item?.sha256 ?? null,
        codeSigning: item?.codeSigning ?? "not-applicable",
        downloadUrl: asset.browser_download_url,
      };
    });
    if (!completeHostSet(files)) continue;

    return {
      version: manifest?.version || release.tag_name,
      generatedAt: manifest?.generatedAt || release.published_at || undefined,
      prerelease: release.prerelease,
      files,
      metadata: Object.fromEntries(
        assets
          .filter((asset) => /^(?:release-manifest\.json|SHA256SUMS\.txt)$/.test(asset.name))
          .map((asset) => [asset.name, asset.browser_download_url]),
      ),
    };
  }
  return null;
}
