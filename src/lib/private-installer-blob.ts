import { get } from "@vercel/blob";

const PRIVATE_INSTALLER_PREFIX = "installers/current/";

export function isPrivateInstallerBlobPath(value: string | null | undefined) {
  return Boolean(value && value.startsWith(PRIVATE_INSTALLER_PREFIX) && !value.includes(".."));
}

export async function getPrivateInstallerBlobPath(pathname: string) {
  if (!isPrivateInstallerBlobPath(pathname)) return null;
  return await get(pathname, { access: "private" });
}
