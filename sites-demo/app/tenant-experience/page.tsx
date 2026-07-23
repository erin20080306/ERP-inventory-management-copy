import { requireChatGPTUser } from "../chatgpt-auth";
import { TenantExperienceClient } from "./tenant-experience-client";

export const dynamic = "force-dynamic";

export default async function TenantExperiencePage() {
  const user = process.env.NODE_ENV === "development"
    ? { displayName: "示範租戶管理者", email: "manager@demo.local", fullName: "示範租戶管理者" }
    : await requireChatGPTUser("/tenant-experience");

  return <TenantExperienceClient managerName={user.displayName} />;
}
