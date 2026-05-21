import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const password = "qwe811122";
  const hash = await bcrypt.hash(password, 10);

  // admin 用戶已存在 (id: cmpfiroek006011j5t0iap0q6)，更新為超級管理員
  const user = await prisma.user.update({
    where: { id: "cmpfiroek006011j5t0iap0q6" },
    data: {
      isSuperAdmin: true,
      passwordHash: hash,
      isActive: true,
      isPaid: true,
    },
  });

  console.log(`✅ admin 已更新為超級管理員`);
  console.log(`   密碼: qwe811122`);
  console.log(`   租戶 ID: ${user.tenantId}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
