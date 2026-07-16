import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { get, list } from "@vercel/blob";

export const INSTALLER_NAME = /^ErinERP-(?:Host|Desktop)-[A-Za-z0-9._-]+\.(?:dmg|zip|exe)$/i;
export const INSTALLER_METADATA = /^(?:release-manifest\.json|SHA256SUMS\.txt)$/;

export type InstallerFile = {
  name: string;
  size: number;
  updatedAt: string;
  platform: string;
  kind: "company-host" | "workstation";
  sha256: string | null;
  codeSigning: string | null;
  downloadUrl: string;
};

export type InstallerRelease = {
  version?: string;
  generatedAt?: string;
  prerelease: boolean;
  readyForCustomers: boolean;
  storage: "blob" | "github" | "local";
  prefix?: string;
  files: InstallerFile[];
  metadata: Record<string, string>;
};

type ManifestArtifact = {
  name: string;
  sha256?: string;
  kind?: string;
  platform?: string;
  codeSigning?: string;
};

type GithubAsset = {
  name: string;
  size: number;
  updated_at: string;
  browser_download_url: string;
};

type GithubRelease = {
  tag_name?: string;
  published_at?: string;
  prerelease?: boolean;
  draft?: boolean;
  assets?: GithubAsset[];
};

function platformLabel(name: string) {
  if (/host.*windows/i.test(name)) return "Windows 公司主機（需 Docker Desktop）";
  if (/host.*macos/i.test(name)) return "macOS 公司主機（需 Docker Desktop）";
  if (/windows.*x64/i.test(name)) return "Windows x64（一般 Windows 電腦）";
  if (/windows.*arm64/i.test(name)) return "Windows ARM64";
  if (/macos.*arm64/i.test(name)) return "macOS Apple Silicon";
  if (/macos/i.test(name)) return "macOS";
  return "其他";
}

function githubHeaders() {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "ErinERP-Installer-Release",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (process.env.GITHUB_RELEASE_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_RELEASE_TOKEN}`;
  return headers;
}

function repository() {
  const value = (process.env.INSTALLER_RELEASE_REPOSITORY || "erin20080306/ERP-inventory-management-copy").trim();
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value)) throw new Error("安裝包 GitHub repository 設定無效");
  return value;
}

async function fetchGithubJson<T>(url: string): Promise<T | null> {
  const response = await fetch(url, { headers: githubHeaders(), next: { revalidate: 60 } });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`GitHub release 讀取失敗 (${response.status})`);
  return await response.json() as T;
}

async function remoteRelease(allowPrerelease: boolean): Promise<InstallerRelease | null> {
  const base = `https://api.github.com/repos/${repository()}/releases`;
  let release: GithubRelease | null = null;
  if (allowPrerelease) {
    const releases = await fetchGithubJson<GithubRelease[]>(`${base}?per_page=10`);
    release = releases?.find((item) => !item.draft) ?? null;
  } else {
    release = await fetchGithubJson<GithubRelease>(`${base}/latest`);
  }
  if (!release) return null;

  const assets = release.assets ?? [];
  const byName = new Map(assets.map((asset) => [asset.name, asset]));
  let manifest: { schema?: string; version?: string; generatedAt?: string; artifacts?: ManifestArtifact[] } | null = null;
  const manifestAsset = byName.get("release-manifest.json");
  if (manifestAsset) {
    const response = await fetch(manifestAsset.browser_download_url, { headers: { "User-Agent": "ErinERP-Installer-Release" }, next: { revalidate: 60 } });
    if (response.ok) manifest = await response.json();
  }
  const manifestItems = new Map((manifest?.artifacts ?? []).map((item) => [item.name, item]));
  const files = assets.filter((asset) => INSTALLER_NAME.test(asset.name)).map((asset) => {
    const item = manifestItems.get(asset.name);
    return {
      name: asset.name,
      size: asset.size,
      updatedAt: asset.updated_at,
      platform: platformLabel(asset.name),
      kind: (asset.name.startsWith("ErinERP-Host-") ? "company-host" : "workstation") as "company-host" | "workstation",
      sha256: item?.sha256 ?? null,
      codeSigning: item?.codeSigning ?? null,
      downloadUrl: asset.browser_download_url,
    };
  });
  const workstations = files.filter((file) => file.kind === "workstation");
  // 客戶正式下載只接受已完成程式簽章的工作站包。未簽章／ad-hoc 包仍可由
  // 平台管理員內部驗收，但不可再冒充正式交付版本。
  const readyForCustomers = workstations.length > 0 && workstations.every((file) => file.codeSigning === "signed");
  const metadata = Object.fromEntries(assets.filter((asset) => INSTALLER_METADATA.test(asset.name)).map((asset) => [asset.name, asset.browser_download_url]));
  return {
    version: manifest?.version ?? release.tag_name,
    generatedAt: manifest?.generatedAt ?? release.published_at,
    prerelease: Boolean(release.prerelease),
    readyForCustomers,
    storage: "github",
    files,
    metadata,
  };
}

const BLOB_PREFIX = "installers/current";

async function blobRelease(): Promise<InstallerRelease | null> {
  const result = await list({ prefix: `${BLOB_PREFIX}/`, limit: 100 });
  const blobs = result.blobs;
  if (!blobs.length) return null;
  const manifestPath = `${BLOB_PREFIX}/release-manifest.json`;
  const manifestBlob = await get(manifestPath, { access: "private" });
  let manifest: { version?: string; generatedAt?: string; artifacts?: ManifestArtifact[] } | null = null;
  if (manifestBlob?.statusCode === 200) {
    manifest = await new Response(manifestBlob.stream).json();
  }
  const manifestItems = new Map((manifest?.artifacts ?? []).map((item) => [item.name, item]));
  const files = blobs.filter((blob) => INSTALLER_NAME.test(path.basename(blob.pathname))).map((blob) => {
    const name = path.basename(blob.pathname);
    const item = manifestItems.get(name);
    return {
      name,
      size: blob.size,
      updatedAt: blob.uploadedAt.toISOString(),
      platform: platformLabel(name),
      kind: (name.startsWith("ErinERP-Host-") ? "company-host" : "workstation") as "company-host" | "workstation",
      sha256: item?.sha256 ?? null,
      codeSigning: item?.codeSigning ?? null,
      downloadUrl: blob.pathname,
    };
  });
  if (!files.length) return null;
  const version = manifest?.version ?? "current";
  const metadata = Object.fromEntries(
    blobs
      .map((blob) => [path.basename(blob.pathname), blob.pathname] as const)
      .filter(([name]) => INSTALLER_METADATA.test(name)),
  );
  return {
    version,
    generatedAt: manifest?.generatedAt,
    prerelease: /(?:test|local|beta|rc)/i.test(version),
    readyForCustomers: files.some((file) => file.kind === "workstation") && files.filter((file) => file.kind === "workstation").every((file) => file.codeSigning === "signed"),
    storage: "blob",
    prefix: BLOB_PREFIX,
    files,
    metadata,
  };
}

async function localRelease(): Promise<InstallerRelease | null> {
  const output = path.join(process.cwd(), "dist", "desktop");
  try {
    const manifest = JSON.parse(await readFile(path.join(output, "release-manifest.json"), "utf8")) as {
      version?: string;
      generatedAt?: string;
      artifacts?: ManifestArtifact[];
    };
    const manifestItems = new Map((manifest.artifacts ?? []).map((item) => [item.name, item]));
    const names = (await readdir(output)).filter((name) => INSTALLER_NAME.test(name));
    const files = await Promise.all(names.map(async (name) => {
      const info = await stat(path.join(output, name));
      const item = manifestItems.get(name);
      return {
        name,
        size: info.size,
        updatedAt: info.mtime.toISOString(),
        platform: platformLabel(name),
        kind: (name.startsWith("ErinERP-Host-") ? "company-host" : "workstation") as "company-host" | "workstation",
        sha256: item?.sha256 ?? null,
        codeSigning: item?.codeSigning ?? null,
        downloadUrl: `/api/admin/installers?file=${encodeURIComponent(name)}&source=local`,
      };
    }));
    const workstations = files.filter((file) => file.kind === "workstation");
    return { version: manifest.version, generatedAt: manifest.generatedAt, prerelease: true, readyForCustomers: workstations.length > 0 && workstations.every((file) => file.codeSigning === "signed"), storage: "local", files, metadata: {} };
  } catch {
    return null;
  }
}

export async function getInstallerRelease(options: { allowPrerelease: boolean; localFallback?: boolean }) {
  try {
    const blob = await blobRelease();
    if (blob) return blob;
  } catch (error) {
    console.error("[installer-release] private blob lookup failed", error);
  }
  try {
    const remote = await remoteRelease(options.allowPrerelease);
    if (remote) return remote;
  } catch (error) {
    console.error("[installer-release] remote release lookup failed", error);
  }
  return options.localFallback ? await localRelease() : null;
}

export async function getPrivateInstallerBlob(release: InstallerRelease, name: string) {
  if (release.storage !== "blob" || !release.prefix) return null;
  return await get(`${release.prefix}/${name}`, { access: "private" });
}
