export const ERIN_CLIENT_PLATFORM_HEADER = "x-erin-client-platform";
export const IOS_APP_CLIENT_PLATFORM = "ios-app";
export const IOS_APP_USER_AGENT_MARKER = "ErinERP-iOS-App";

type RequestHeaders = Pick<Headers, "get">;

export function isIosAppRequest(headers: RequestHeaders) {
  const explicitPlatform = headers.get(ERIN_CLIENT_PLATFORM_HEADER)?.trim().toLowerCase();
  if (explicitPlatform === IOS_APP_CLIENT_PLATFORM) return true;

  const userAgent = headers.get("user-agent") || "";
  return userAgent.includes(IOS_APP_USER_AGENT_MARKER);
}

export function isMedicalEnabledForRequest(headers: RequestHeaders) {
  return !isIosAppRequest(headers);
}

const IOS_RESTRICTED_MEDICAL_PATHS = [
  "/medical",
  "/api/medical",
  "/api/medical-site",
  "/print/medical-receipt",
] as const;

export function isIosRestrictedMedicalPath(pathname: string) {
  return IOS_RESTRICTED_MEDICAL_PATHS.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
