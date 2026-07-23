import { prisma } from "./prisma";
import { seedTenantDefaultsBatched } from "./seed-tenant-batched";

// v3 會讓既有租戶安全重跑一次可重入初始化，補足各模式商品目錄與圖片。
export const BASELINE_STARTED_ACTION = "tenant_baseline_v3_started";
export const BASELINE_MARKER_ACTION = "tenant_baseline_v3_seeded";
export const BASELINE_FAILED_ACTION = "tenant_baseline_v3_failed";

const readyTenants = new Set<string>();

export type TenantBaselineResult = {
  ready: true;
  status: "READY";
  startedAt: string;
  completedAt: string;
  durationMs: number;
};

export type TenantBaselineStatus =
  | TenantBaselineResult
  | {
      ready: false;
      status: "PENDING" | "RUNNING";
      startedAt?: string;
    }
  | {
      ready: false;
      status: "FAILED";
      startedAt?: string;
      failedAt: string;
      durationMs?: number;
    };

const pendingTenants = new Map<string, Promise<TenantBaselineResult>>();

function parseDetail(detail: string | null | undefined) {
  if (!detail) return {} as Record<string, unknown>;
  try {
    return JSON.parse(detail) as Record<string, unknown>;
  } catch {
    return {} as Record<string, unknown>;
  }
}

/** 只檢查完成標記，不在登入或工作台路由中建立資料。 */
export async function isTenantBaselineReady(tenantId: string | null | undefined) {
  if (!tenantId) return false;
  if (readyTenants.has(tenantId)) return true;

  const marker = await prisma.auditLog.findFirst({
    where: { tenantId, action: BASELINE_MARKER_ACTION },
    select: { id: true },
  });
  if (!marker) return false;

  readyTenants.add(tenantId);
  return true;
}

export async function getTenantBaselineStatus(tenantId: string | null | undefined): Promise<TenantBaselineStatus> {
  if (!tenantId) return { ready: false, status: "PENDING" };

  const logs = await prisma.auditLog.findMany({
    where: {
      tenantId,
      action: { in: [BASELINE_STARTED_ACTION, BASELINE_MARKER_ACTION, BASELINE_FAILED_ACTION] },
    },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { action: true, detail: true, createdAt: true },
  });

  const completed = logs.find((log) => log.action === BASELINE_MARKER_ACTION);
  if (completed) {
    const detail = parseDetail(completed.detail);
    return {
      ready: true,
      status: "READY",
      startedAt: typeof detail.startedAt === "string" ? detail.startedAt : completed.createdAt.toISOString(),
      completedAt: typeof detail.completedAt === "string" ? detail.completedAt : completed.createdAt.toISOString(),
      durationMs: typeof detail.durationMs === "number" ? detail.durationMs : 0,
    };
  }

  const latest = logs[0];
  if (latest?.action === BASELINE_FAILED_ACTION) {
    const detail = parseDetail(latest.detail);
    return {
      ready: false,
      status: "FAILED",
      startedAt: typeof detail.startedAt === "string" ? detail.startedAt : undefined,
      failedAt: typeof detail.failedAt === "string" ? detail.failedAt : latest.createdAt.toISOString(),
      durationMs: typeof detail.durationMs === "number" ? detail.durationMs : undefined,
    };
  }

  const started = logs.find((log) => log.action === BASELINE_STARTED_ACTION);
  return started
    ? { ready: false, status: "RUNNING", startedAt: started.createdAt.toISOString() }
    : { ready: false, status: "PENDING" };
}

/**
 * 由登入後的獨立初始化 API 呼叫。
 * 固定代碼、createMany 與同一交易讓失敗後可安全重試且不重複建立。
 */
export async function ensureTenantBaseline(tenantId: string): Promise<TenantBaselineResult> {
  const current = await getTenantBaselineStatus(tenantId);
  if (current.ready) {
    readyTenants.add(tenantId);
    return current;
  }

  const pending = pendingTenants.get(tenantId);
  if (pending) return await pending;

  const work = (async (): Promise<TenantBaselineResult> => {
    const startedAt = new Date();
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true },
    });
    if (!tenant) throw new Error("租戶不存在，無法初始化");

    await prisma.auditLog.create({
      data: {
        tenantId: tenant.id,
        action: BASELINE_STARTED_ACTION,
        module: "system",
        detail: JSON.stringify({ startedAt: startedAt.toISOString() }),
      },
    });

    try {
      await seedTenantDefaultsBatched(tenant.id);
      const completedAt = new Date();
      const result: TenantBaselineResult = {
        ready: true,
        status: "READY",
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        durationMs: completedAt.getTime() - startedAt.getTime(),
      };

      await prisma.auditLog.create({
        data: {
          tenantId: tenant.id,
          action: BASELINE_MARKER_ACTION,
          module: "system",
          detail: JSON.stringify({
            ...result,
            summary: "科目、倉庫、商品、庫存、客戶、供應商、範例單據與業態設定已建立",
          }),
        },
      });
      readyTenants.add(tenant.id);
      return result;
    } catch (error) {
      const failedAt = new Date();
      await prisma.auditLog.create({
        data: {
          tenantId: tenant.id,
          action: BASELINE_FAILED_ACTION,
          module: "system",
          detail: JSON.stringify({
            startedAt: startedAt.toISOString(),
            failedAt: failedAt.toISOString(),
            durationMs: failedAt.getTime() - startedAt.getTime(),
            error: error instanceof Error ? error.message.slice(0, 500) : "unknown",
          }),
        },
      }).catch(() => {});
      throw error;
    }
  })().finally(() => {
    pendingTenants.delete(tenantId);
  });

  pendingTenants.set(tenantId, work);
  return await work;
}
