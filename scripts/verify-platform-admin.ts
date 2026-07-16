import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";
import { computeLicenseAccess } from "../src/lib/license";
import { hasPermission } from "../src/lib/auth";
import { INTERNAL_ADMIN_COMPANY_CODE } from "../src/lib/internal-admin-tenant";

const username = process.env.SUPERADMIN_USERNAME;
const password = process.env.SUPERADMIN_PASSWORD;
if (!username || !password) throw new Error("缺少平台管理者驗證環境變數");

async function main() {
  const user = await prisma.user.findUnique({
    where: { username },
    include: { tenant: true },
  });
  assert.ok(user, "找不到指定平台管理者");
  assert.equal(user.isActive, true);
  assert.equal(user.isSuperAdmin, true);
  assert.equal(await bcrypt.compare(password!, user.passwordHash), true, "平台管理者密碼驗證失敗");
  assert.equal(await prisma.user.count({ where: { isSuperAdmin: true, isActive: true } }), 1);
  assert.equal(user.tenant?.isInternal, true);
  assert.equal(user.tenant?.companyCode, INTERNAL_ADMIN_COMPANY_CODE);
  assert.equal(user.tenant?.businessMode, "POS_RESTAURANT");

  const access = computeLicenseAccess({ isSuperAdmin: true });
  assert.equal(access.allowed, true);
  assert.equal(access.paymentType, "ONCE");
  for (const permission of ["pos.view", "restaurant.view", "inventory.view", "accounting.view", "users.manage", "audit.view"]) {
    assert.equal(hasPermission(["*"], permission), true);
  }

  console.log("Unique platform admin, password, free internal tenant and complete ERP/POS permissions: PASS");
}

main().finally(() => prisma.$disconnect());
