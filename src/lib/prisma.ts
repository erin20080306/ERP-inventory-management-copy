import { PrismaClient } from "@prisma/client";

const g = globalThis as unknown as { prisma?: PrismaClient };

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export const prisma =
  g.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    transactionOptions: {
      maxWait: positiveInteger(process.env.PRISMA_TRANSACTION_MAX_WAIT_MS, 10_000),
      timeout: positiveInteger(process.env.PRISMA_TRANSACTION_TIMEOUT_MS, 15_000),
    },
  });

// Also reuse the client in production warm instances. This avoids opening a new
// pool when Next.js evaluates the module through more than one server bundle.
if (!g.prisma) g.prisma = prisma;
