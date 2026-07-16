import { ApiError, apiHandler, requirePermission } from "@/lib/api";

export const runtime = "nodejs";

export const POST = apiHandler(async () => {
  await requirePermission("settings.manage");
  throw new ApiError(410, "線上 JSON 還原已停用，避免不完整資料表或跨公司系統角色被誤刪。請由艾琳設計在維護模式使用已驗證的 PostgreSQL 加密備份還原程序。");
});
