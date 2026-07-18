import { get, issueSignedToken, presignUrl } from "@vercel/blob";

const PRIVATE_INSTALLER_PREFIX = "installers/current/";

export function isPrivateInstallerBlobPath(value: string | null | undefined) {
  return Boolean(value && value.startsWith(PRIVATE_INSTALLER_PREFIX) && !value.includes(".."));
}

export async function getPrivateInstallerBlobPath(pathname: string) {
  if (!isPrivateInstallerBlobPath(pathname)) return null;
  return await get(pathname, { access: "private" });
}

export async function getPrivateInstallerSignedUrl(pathname: string) {
  if (!isPrivateInstallerBlobPath(pathname)) return null;
  const validUntil = Date.now() + 10 * 60_000;
  const token = await issueSignedToken({
    pathname,
    operations: ["get"],
    validUntil,
  });
  const { presignedUrl } = await presignUrl(token, {
    access: "private",
    pathname,
    operation: "get",
    validUntil,
  });
  return presignedUrl;
}
