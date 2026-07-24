import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { isTenantHighestPrivilege } from "../src/lib/storefront-access";

const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8");

assert.equal(isTenantHighestPrivilege({
  tenantId: "tenant-a",
  permissions: ["*"],
  isSuperAdmin: false,
  isTenantOwner: false,
}), false, "all permissions alone must not make a user the tenant owner");

assert.equal(isTenantHighestPrivilege({
  tenantId: "tenant-a",
  permissions: ["*"],
  isSuperAdmin: false,
  isTenantOwner: true,
}), true, "the registered tenant owner receives storefront management mode");

const schema = read("prisma/schema.prisma");
const migration = read("prisma/migrations/20260724233000_tenant_owned_roles/migration.sql");
const auth = read("src/lib/auth.ts");
const registration = read("src/app/api/register/route.ts");
const usersRoute = read("src/app/api/users/route.ts");
const userRoute = read("src/app/api/users/[id]/route.ts");
const rolesRoute = read("src/app/api/roles/route.ts");
const roleRoute = read("src/app/api/roles/[id]/route.ts");
const tenantOwner = read("src/lib/tenant-owner.ts");

assert.match(schema, /isTenantOwner\s+Boolean\s+@default\(false\)/);
assert.match(schema, /model Role \{[\s\S]*tenantId\s+String\?[\s\S]*@@unique\(\[tenantId, name\]\)/);
assert.match(migration, /PARTITION BY "tenantId"/);
assert.match(migration, /CREATE UNIQUE INDEX "User_one_tenant_owner_key"/);
assert.match(migration, /CREATE UNIQUE INDEX "Role_tenantId_name_key"/);
assert.match(auth, /user\.isTenantOwner \|\| user\.isSuperAdmin \? \["\*"\]/);
assert.match(auth, /token\.isTenantOwner/);
assert.match(registration, /isTenantOwner: true/);
assert.match(usersRoute, /requireTenantOwner\("users\.create"\)/);
assert.match(usersRoute, /isTenantOwner: false/);
assert.match(usersRoute, /validateAssignableRoleIds\(tenantId/);
assert.match(userRoute, /requireTenantOwner\("users\.edit"\)/);
assert.match(userRoute, /target\.isTenantOwner && isActive === false/);
assert.match(userRoute, /target\.isTenantOwner \|\| session\.user\.id === target\.id/);
assert.match(rolesRoute, /OR: \[\{ tenantId \}, \{ tenantId: null \}\]/);
assert.match(rolesRoute, /data: \{ tenantId, name, description \}/);
assert.match(roleRoute, /where: \{ id: params\.id, tenantId \}/);
assert.match(tenantOwner, /包含其他租戶或不存在的角色/);
assert.match(tenantOwner, /租戶擁有人角色不可指派給新增使用者/);

console.log("Tenant owner and tenant-isolated RBAC verification passed");
