import { prisma } from "./prisma";
import { syncLocalStorefrontOrderStatus } from "./storefront-order-sync";

function backfillKey(tenantId: string) {
  return `storefront-order-status-backfill:${tenantId}:v1`;
}

export async function backfillLocalStorefrontOrderStatuses(tenantId: string) {
  if (process.env.LOCAL_LICENSE_MODE !== "true") return { processed: 0, queued: 0 };
  const key = backfillKey(tenantId);
  const completed = await prisma.systemSetting.findUnique({ where: { key } });
  if (completed) return { processed: 0, queued: 0 };

  const orders = await prisma.salesOrder.findMany({
    where: {
      tenantId,
      remark: { contains: "[CENTRAL-WEB:" },
      status: { in: ["APPROVED", "PARTIALLY_SHIPPED", "POSTED", "REJECTED", "VOIDED"] },
    },
    select: { id: true },
    orderBy: { updatedAt: "asc" },
    take: 500,
  });

  let processed = 0;
  let queued = 0;
  for (const order of orders) {
    const result = await syncLocalStorefrontOrderStatus(tenantId, order.id);
    if (result.synced) processed += 1;
    if (result.queued) queued += 1;
  }

  await prisma.systemSetting.upsert({
    where: { key },
    update: { value: JSON.stringify({ completedAt: new Date().toISOString(), processed, queued }) },
    create: { key, value: JSON.stringify({ completedAt: new Date().toISOString(), processed, queued }) },
  });
  return { processed, queued };
}
