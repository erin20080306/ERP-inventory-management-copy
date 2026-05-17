import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function syncTrialPeriod() {
  console.log("Starting trial period synchronization for all tenants...");
  
  // Get all tenants
  const tenants = await prisma.tenant.findMany({
    select: { id: true },
  });
  
  console.log(`Found ${tenants.length} tenants`);
  
  for (const tenant of tenants) {
    // Get the first user (registration account) for this tenant
    const firstUser = await prisma.user.findFirst({
      where: { tenantId: tenant.id },
      orderBy: { createdAt: "asc" },
      select: { id: true, trialStart: true },
    });
    
    if (!firstUser || !firstUser.trialStart) {
      console.log(`Tenant ${tenant.id}: No first user or trialStart found, skipping`);
      continue;
    }
    
    console.log(`Tenant ${tenant.id}: First user trialStart = ${firstUser.trialStart.toISOString()}`);
    
    // Update all other users in this tenant to have the same trialStart
    const result = await prisma.user.updateMany({
      where: {
        tenantId: tenant.id,
        id: { not: firstUser.id },
      },
      data: {
        trialStart: firstUser.trialStart,
      },
    });
    
    console.log(`Tenant ${tenant.id}: Updated ${result.count} users`);
  }
  
  console.log("Trial period synchronization completed");
}

syncTrialPeriod()
  .then(() => {
    console.log("Done");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });
