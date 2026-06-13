import { NextResponse, NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, hasPermission } from "./auth";
import { prisma } from "./prisma";
import { reportError } from "./error-report";

const TENANT_EXISTS_TTL_MS = 60_000;
const tenantExistsCache = new Map<string, { exists: boolean; expiresAt: number }>();

export async function getSession() {
  return await getServerSession(authOptions);
}

export async function requireAuth() {
  const session = await getSession();
  if (!session?.user) throw new ApiError(401, "未登入");
  return session;
}

export async function requirePermission(code: string) {
  const session = await requireAuth();
  if (!hasPermission(session.user.permissions, code)) {
    throw new ApiError(403, `權限不足: 需要 ${code}`);
  }
  return session;
}

export async function requireTenantId(activeSession?: Awaited<ReturnType<typeof requireAuth>>) {
  const session = activeSession ?? await requireAuth();
  const tenantId = (session.user as any).tenantId;
  if (!tenantId) throw new ApiError(401, "無租戶資訊");
  
  // 驗證租戶是否存在
  const cached = tenantExistsCache.get(tenantId);
  const now = Date.now();
  if (!cached || cached.expiresAt <= now) {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } });
    tenantExistsCache.set(tenantId, { exists: Boolean(tenant), expiresAt: now + TENANT_EXISTS_TTL_MS });
  }
  if (!tenantExistsCache.get(tenantId)?.exists) throw new ApiError(401, "租戶不存在或已被刪除");
  
  return tenantId as string;
}

export async function getCurrentUserId() {
  const session = await requireAuth();
  // 回傳使用者姓名作為操作人員欄位顯示值
  return (session.user as any).name as string || (session.user as any).username as string || (session.user as any).id as string;
}

export async function getCurrentUserName() {
  const session = await requireAuth();
  return (session.user as any).name as string || (session.user as any).username as string || "";
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function apiHandler<T extends (...args: any[]) => Promise<any>>(fn: T) {
  return async (...args: Parameters<T>) => {
    try {
      return await fn(...args);
    } catch (e: any) {
      if (e?.digest === "DYNAMIC_SERVER_USAGE" || e?.message?.includes("Dynamic server usage")) {
        throw e;
      }
      if (e instanceof ApiError) {
        return NextResponse.json({ error: e.message }, { status: e.status });
      }
      console.error("[API Error]", e);
      const req = args[0] as NextRequest | undefined;
      let ctx: { tenantId?: string | null; userId?: string | null; method?: string | null; path?: string | null; status: number; ip?: string | null; userAgent?: string | null } = { status: 500 };
      try {
        if (req && typeof (req as any).headers?.get === "function") {
          ctx.method = req.method ?? null;
          ctx.path = req.nextUrl?.pathname ?? null;
          ctx.ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || req.headers.get("cf-connecting-ip") || null;
          ctx.userAgent = req.headers.get("user-agent") || null;
        }
        const session = await getSession();
        ctx.tenantId = (session?.user as any)?.tenantId ?? null;
        ctx.userId = (session?.user as any)?.id ?? null;
      } catch {}
      void reportError(e, ctx);
      return NextResponse.json({ error: e?.message ?? "伺服器錯誤" }, { status: 500 });
    }
  };
}

export async function audit(opts: {
  userId?: string | null;
  action: string;
  module: string;
  refId?: string;
  detail?: string;
  ip?: string;
}) {
  try {
    await prisma.auditLog.create({ data: { ...opts } });
  } catch (e) {
    console.error("[audit] failed", e);
  }
}

export async function logPermissionChange(opts: {
  userId?: string | null;
  roleId: string;
  roleName: string;
  action: "create" | "update" | "delete";
  before?: string;
  after?: string;
  ip?: string;
  userAgent?: string;
}) {
  try {
    // Use existing PermissionChangeLog table structure
    // Map to existing columns: newValue, oldValue, permissionCode
    await prisma.permissionChangeLog.create({
      data: {
        userId: opts.userId,
        roleId: opts.roleId,
        roleName: opts.roleName,
        action: opts.action,
        oldValue: opts.before,
        newValue: opts.after,
        permissionCode: `${opts.action}_${opts.roleName}`,
        ip: opts.ip,
        userAgent: opts.userAgent,
      },
    });
  } catch (e) {
    console.error("[logPermissionChange] failed", e);
  }
}

export function getClientInfo(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") || 
            req.headers.get("x-real-ip") || 
            req.headers.get("cf-connecting-ip") || 
            "unknown";
  const userAgent = req.headers.get("user-agent") || "unknown";
  return { ip, userAgent };
}

// 編號產生器
export async function nextNumber(key: string, tenantId: string) {
  return await prisma.$transaction(async (tx: any) => {
    let seq = await tx.numberSequence.findUnique({
      where: { tenantId_key: { tenantId, key } },
    });
    if (!seq) {
      seq = await tx.numberSequence.create({ data: { tenantId, key, prefix: key, nextNo: 1 } });
    }
    const now = new Date();
    const yyyy = String(now.getFullYear());
    const yy = yyyy.slice(2);
    const roc = String(now.getFullYear() - 1911);
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const seqStr = String(seq.nextNo).padStart(4, "0");
    // 傳票 (JE) 採用純數字格式：民國年(3)+月日+流水號 e.g. 11501030001
    const isJE = key === "JE";
    const fmt = seq.format || (isJE ? "{roc}{mm}{dd}{seq:0000}" : "{prefix}{yyyy}{mm}-{seq:0000}");
    const number = fmt
      .replace("{prefix}", isJE ? "" : seq.prefix)
      .replace("{roc}", roc)
      .replace("{yyyy}", yyyy)
      .replace("{yy}", yy)
      .replace("{mm}", mm)
      .replace("{dd}", dd)
      .replace("{seq:0000}", seqStr);
    await tx.numberSequence.update({ where: { tenantId_key: { tenantId, key } }, data: { nextNo: seq.nextNo + 1 } });
    return number;
  });
}
