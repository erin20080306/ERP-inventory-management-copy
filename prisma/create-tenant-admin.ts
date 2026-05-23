import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // 獲取第一個租戶
  const tenant = await prisma.tenant.findFirst();
  if (!tenant) {
    console.log("❌ 沒有租戶，請先執行 prisma db seed");
    return;
  }

  // 創建租戶管理員
  const hash = await bcrypt.hash("admin123", 12);
  const user = await prisma.user.create({
    data: {
      username: "admin",
      name: "管理員",
      email: "admin@example.com",
      passwordHash: hash,
      tenantId: tenant.id,
      isActive: true,
      isPaid: true,
      trialStart: new Date(),
    },
  });

  // 分配系統管理員角色
  const systemRole = await prisma.role.findFirst({
    where: { name: "系統管理員" },
  });
  if (systemRole) {
    await prisma.userRole.create({
      data: {
        userId: user.id,
        roleId: systemRole.id,
      },
    });
  }

  console.log(`✅ 租戶管理員已創建：${user.name} (${user.username})`);
  console.log(`   租戶：${tenant.name}`);
  console.log(`   密碼：admin123`);
  console.log(`   登入後可進入 /dashboard`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
