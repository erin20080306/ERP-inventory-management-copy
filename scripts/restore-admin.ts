import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";
import { ensureInternalAdminTenant } from "../src/lib/internal-admin-tenant";


async function main() {
  const password = process.env.SUPERADMIN_PASSWORD;
  const username = process.env.SUPERADMIN_USERNAME;
  if (!username || !password || !/^(?=.*[A-Za-z])(?=.*\d).{8,72}$/.test(password)) {
    throw new Error("必須設定 SUPERADMIN_USERNAME；SUPERADMIN_PASSWORD 需為 8～72 字元且包含英文與數字");
  }
  const hash = await bcrypt.hash(password, 12);

  let current = await prisma.user.findUnique({ where: { username }, select: { id: true } });
  if (!current) {
    const previousUsername = process.env.SUPERADMIN_PREVIOUS_USERNAME;
    if (previousUsername) current = await prisma.user.findUnique({ where: { username: previousUsername }, select: { id: true } });
  }
  if (!current) {
    const existing = await prisma.user.findMany({ where: { isSuperAdmin: true }, take: 2, select: { id: true } });
    if (existing.length !== 1) throw new Error("找不到唯一可改名的平台管理者，請設定 SUPERADMIN_PREVIOUS_USERNAME");
    current = existing[0];
  }

  const user = await prisma.user.update({
    where: { id: current.id },
    data: {
      username,
      isSuperAdmin: true,
      passwordHash: hash,
      isActive: true,
    },
  });

  const tenant = await ensureInternalAdminTenant(user.id);

  console.log("✅ 指定帳號已更新為唯一平台超級管理員");
  console.log(`   免費內部帳套: ${tenant.name} (${tenant.id})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
