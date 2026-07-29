import { headers } from "next/headers";
import { isIosAppRequest } from "@/lib/client-platform";
import LoginClient from "./client";

export default async function LoginPage() {
  const iosApp = isIosAppRequest(await headers());
  return <LoginClient iosApp={iosApp} />;
}
