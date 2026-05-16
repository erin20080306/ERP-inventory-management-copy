import { getServerSession } from "next-auth";
import { authOptions } from "./auth";

/**
 * 從 session 中取得當前使用者的 tenantId。
 * 若未登入則回傳 null。
 */
export async function getTenantId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  return (session?.user as any)?.tenantId ?? null;
}

/**
 * 同 getTenantId，但若未登入直接拋錯（用於 API route 中）。
 */
export async function requireTenantId(): Promise<string> {
  const tid = await getTenantId();
  if (!tid) throw new Error("Unauthorized: no tenantId");
  return tid;
}
