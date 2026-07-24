-- 既有倉管角色可查看已核准的商城訂單並執行出貨，
-- 但不取得訂單核准、改價、作廢或刪除權限。
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id"
FROM "Role" AS role
CROSS JOIN "Permission" AS permission
WHERE role."name" = '倉管人員'
  AND permission."code" IN ('sales.view', 'sales.post')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
