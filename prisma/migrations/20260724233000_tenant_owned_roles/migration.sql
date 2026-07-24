-- 租戶註冊帳號是唯一最高管理者；既有資料以每個租戶最早建立的非平台帳號回填。
ALTER TABLE "User" ADD COLUMN "isTenantOwner" BOOLEAN NOT NULL DEFAULT false;

WITH ranked_users AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "tenantId"
      ORDER BY "createdAt" ASC, "id" ASC
    ) AS owner_rank
  FROM "User"
  WHERE "tenantId" IS NOT NULL
    AND "isSuperAdmin" = false
)
UPDATE "User" AS target
SET "isTenantOwner" = true
FROM ranked_users
WHERE target."id" = ranked_users."id"
  AND ranked_users.owner_rank = 1;

CREATE UNIQUE INDEX "User_one_tenant_owner_key"
ON "User"("tenantId")
WHERE "isTenantOwner" = true
  AND "tenantId" IS NOT NULL;

-- 系統預設角色保留為全域唯讀範本；租戶新增的角色改由 tenantId 隔離。
ALTER TABLE "Role" ADD COLUMN "tenantId" TEXT;
DROP INDEX IF EXISTS "Role_name_key";

CREATE UNIQUE INDEX "Role_tenantId_name_key"
ON "Role"("tenantId", "name");

CREATE UNIQUE INDEX "Role_global_name_key"
ON "Role"("name")
WHERE "tenantId" IS NULL;

CREATE INDEX "Role_tenantId_idx" ON "Role"("tenantId");

ALTER TABLE "Role"
ADD CONSTRAINT "Role_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
