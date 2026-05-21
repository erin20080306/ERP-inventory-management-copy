import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const paidUsers = await prisma.user.findMany({
    where: { isPaid: true },
    select: {
      id: true,
      username: true,
      email: true,
      name: true,
      isPaid: true,
      paymentType: true,
      subscriptionEnd: true,
      createdAt: true,
    },
  });

  console.log('已付款用戶列表：');
  console.log(JSON.stringify(paidUsers, null, 2));
  console.log(`\n總計：${paidUsers.length} 位已付款用戶`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
