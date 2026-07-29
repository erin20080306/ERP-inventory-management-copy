import { headers } from "next/headers";
import { isMedicalEnabledForRequest } from "@/lib/client-platform";
import RegisterClient from "./client";

export default async function RegisterPage() {
  const medicalEnabled = isMedicalEnabledForRequest(await headers());
  return <RegisterClient medicalEnabled={medicalEnabled} />;
}
