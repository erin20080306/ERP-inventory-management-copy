import { NextResponse, NextRequest } from "next/server";
import { getServerSession, type Session } from "next-auth";
import { AsyncLocalStorage } from "node:async_hooks";
import { cache } from "react";
import { authOptions, hasPermission } from "./auth";
import { prisma } from "./prisma";
import { reportError } from "./error-report";
import { getLicenseAccessForUser, verifyLocalWorkstationRequest } from "./license";
import { appendAuditLog } from "./integrity";
import { normalizeBusinessMode } from "./product-editions";

const TENANT_EXISTS_TTL_MS = 60_000;
const tenantExistsCache = new Map<string, { exists: boolean; expiresAt: number }>();
type ActiveSession = Session | null;
type ApiRequestContext = {
  sessionPromise?: Promise<ActiveSession>;
  authPromise?: Promise<NonNullable<ActiveSession>>;
};
const apiRequestContext = new AsyncLocalStorage<ApiRequestContext>();
const getServerComponentSession = cache(
  () => getServerSession(authOptions) as Promise<ActiveSession>,
);

function comparableRequestTarget(value: string) {
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("#")) return null;
  try {
    const url = new URL(value, "http://erin-workstation.local");
    if (url.origin !== "http://erin-workstation.local") return null;
    return {
      pathname: url.pathname.replace(/%[0-9a-f]{2}/gi, (encoded) => encoded.toUpperCase()),
      query: JSON.stringify([...url.searchParams.entries()]),
    };
  } catch {
    return null;
  }
}

function sameRequestTarget(left: string, right: string) {
  const normalizedLeft = comparableRequestTarget(left);
  const normalizedRight = comparableRequestTarget(right);
  return Boolean(
    normalizedLeft &&
    normalizedRight &&
    normalizedLeft.pathname === normalizedRight.pathname &&
    normalizedLeft.query === normalizedRight.query
  );
}

export async function getSession() {
  const context = apiRequestContext.getStore();
  if (context?.sessionPromise) return await context.sessionPromise;
  if (!context) return await getServerComponentSession();
  const sessionPromise = getServerSession(authOptions) as Promise<ActiveSession>;
  context.sessionPromise = sessionPromise;
  return await sessionPromise;
}

export async function requireAuth() {
  const context = apiRequestContext.getStore();
  if (context?.authPromise) return await context.authPromise;
  const authPromise = (async () => {
    const session = await getSession();
    if (!session?.user) throw new ApiError(401, "未登入");
    const access = await getLicenseAccessForUser(session.user.id);
    if (!access.allowed) {
      throw new ApiError(402, access.reason ?? "公司授權已到期，請聯絡艾琳設計開通");
    }
    return session;
  })();
  if (context) context.authPromise = authPromise;
  return await authPromise;
}

export async function requirePermission(code: string) {
  const session = await requireAuth();
  if (!hasPermission(session.user.permissions, code)) {
    throw new ApiError(403, `權限不足: 需要 ${code}`);
  }
  return session;
}

export async function requirePosPermission(action = "view", secondaryPermission?: string) {
  const session = await requirePermission(`pos.${action}`);
  if (secondaryPermission && !hasPermission(session.user.permissions, secondaryPermission)) {
    throw new ApiError(403, `權限不足: 需要 ${secondaryPermission}`);
  }
  const mode = normalizeBusinessMode(session.user.businessMode);
  if (!session.user.isSuperAdmin && mode === "ERP") throw new ApiError(403, "此公司未開通 POS 業態");
  return session;
}

export async function requireRestaurantPermission(action = "view") {
  const session = await requirePermission(`restaurant.${action}`);
  const mode = normalizeBusinessMode(session.user.businessMode);
  if (!session.user.isSuperAdmin && mode !== "POS_RESTAURANT") throw new ApiError(403, "此公司鎖定為非餐飲業態");
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
  // Next 15 將動態路由 params 改為 Promise；在共用邊界解析一次，既有處理器
  // 仍可安全地使用同步的 context.params，且匯出的型別符合 Route Handler 規格。
  return async (
    req: NextRequest,
    context: { params: Promise<Record<string, string | string[] | undefined>> },
  ) => {
    const resolvedContext = context
      ? { ...context, params: await context.params }
      : undefined;
    return apiRequestContext.run({}, async () => {
      try {
        if (process.env.LOCAL_LICENSE_MODE === "true") {
          const activeSession = await getSession();
          const tenantId = activeSession?.user?.tenantId;
          if (tenantId && !activeSession?.user?.isSuperAdmin) {
            const actualMethod = req.method.toUpperCase();
            const actualPath = `${req.nextUrl.pathname}${req.nextUrl.search}`;
            const originalMethodHeader = req.headers.get("x-erin-original-method");
            const originalPathHeader = req.headers.get("x-erin-original-path");
            let signedMethod = actualMethod;
            let signedPath = actualPath;

            // 桌面代理簽署的是瀏覽器送進代理器時的原始 method/path。Caddy、
            // Node 或 Next.js 可能重新編碼查詢字串；先確認仍是同一 API，再用
            // 原始內容驗章，避免合法 v1.0.7 工作站被誤判為簽章無效。
            if (originalMethodHeader || originalPathHeader) {
              if (!originalMethodHeader || !originalPathHeader) {
                throw new ApiError(403, "工作站原始請求驗證資料不完整");
              }
              const originalMethod = originalMethodHeader.trim().toUpperCase();
              if (!/^[A-Z]+$/.test(originalMethod) || originalMethod !== actualMethod) {
                throw new ApiError(403, "工作站原始請求方法與實際請求不一致");
              }
              if (!sameRequestTarget(originalPathHeader, actualPath)) {
                throw new ApiError(403, "工作站原始請求路徑與實際請求不一致");
              }
              signedMethod = originalMethod;
              signedPath = originalPathHeader;
            }

            let workstation = await verifyLocalWorkstationRequest(tenantId, {
              method: signedMethod,
              path: signedPath,
              headers: req.headers,
            });

            // 相容未經路徑重編碼的舊代理／測試環境。只有原始與實際目標已確認
            // 等價時才重試，因此不會讓簽章被挪用到其他 API。
            if (!workstation.allowed && (signedMethod !== actualMethod || signedPath !== actualPath)) {
              workstation = await verifyLocalWorkstationRequest(tenantId, {
                method: actualMethod,
                path: actualPath,
                headers: req.headers,
              });
            }
            if (!workstation.allowed) throw new ApiError(403, workstation.reason);
          }
        }
        return await fn(req, resolvedContext);
      } catch (e: any) {
        if (e?.digest === "DYNAMIC_SERVER_USAGE" || e?.message?.includes("Dynamic server usage")) {
          throw e;
        }
        if (e instanceof ApiError) {
          return NextResponse.json({ error: e.message }, { status: e.status });
        }
        console.error("[API Error]", e);
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
    });
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
    await appendAuditLog(opts);
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
