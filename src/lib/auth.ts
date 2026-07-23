import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import { normalizeBusinessMode, type BusinessMode } from "./product-editions";
import { ensureInternalAdminTenant } from "./internal-admin-tenant";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      tenantId: string;
      companyCode?: string;
      username: string;
      name: string;
      email: string;
      roles: string[];
      permissions: string[];
      businessMode?: BusinessMode;
      isSuperAdmin?: boolean;
      isInternalAdminTenant?: boolean;
    };
  }
}
declare module "next-auth/jwt" {
  interface JWT {
    uid: string;
    tenantId: string;
    companyCode?: string;
    username: string;
    roles: string[];
    permissions: string[];
    businessMode?: BusinessMode;
    isSuperAdmin?: boolean;
    isInternalAdminTenant?: boolean;
  }
}

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt", maxAge: 60 * 60 * 8 },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, req) {
        if (!credentials?.username || !credentials.password) return null;
        const identifier = credentials.username.trim().toLowerCase();
        if (!identifier) return null;
        const ip = (req?.headers?.["x-forwarded-for"] as string) || "";

        const user = await prisma.user.findFirst({
          where: {
            OR: [
              { username: { equals: identifier, mode: "insensitive" } },
              { email: { equals: identifier, mode: "insensitive" } },
            ],
          },
          include: {
            tenant: { select: { businessMode: true, companyCode: true } },
            userRoles: {
              include: { role: { include: { permissions: { include: { permission: true } } } } },
            },
          },
        });

        const since = new Date(Date.now() - 15 * 60 * 1000);
        const recentFails = await prisma.loginLog.count({
          where: user
            ? { success: false, createdAt: { gte: since }, OR: [{ userId: user.id }, { username: { equals: user.username, mode: "insensitive" } }, { username: { equals: user.email, mode: "insensitive" } }] }
            : { username: { equals: identifier, mode: "insensitive" }, success: false, createdAt: { gte: since } },
        });
        const logUsername = user?.username ?? identifier;

        if (recentFails >= 5) {
          prisma.loginLog
            .create({ data: { userId: user?.id, username: logUsername, success: false, ip, userAgent: req?.headers?.["user-agent"] as string } })
            .catch(() => {});
          throw new Error("登入失敗次數過多，請 15 分鐘後再試");
        }

        if (!user) {
          prisma.loginLog.create({ data: { username: logUsername, success: false, ip } }).catch(() => {});
          return null;
        }

        if (!user.isActive) {
          prisma.loginLog.create({ data: { userId: user.id, username: logUsername, success: false, ip } }).catch(() => {});
          throw new Error("帳號已被鎖定，請聯繫管理員或完成付款後解鎖");
        }

        const ok = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!ok) {
          prisma.loginLog.create({ data: { userId: user.id, username: logUsername, success: false, ip } }).catch(() => {});
          return null;
        }

        const roles = (user.userRoles as any[]).map((ur) => ur.role.name);
        const permsSet = new Set<string>();
        let isSuper = false;
        for (const ur of user.userRoles as any[]) {
          if (ur.role.name === "系統管理員") isSuper = true;
          for (const rp of ur.role.permissions as any[]) permsSet.add(rp.permission.code);
        }
        if ((user as any).isSuperAdmin) isSuper = true;
        const permissions = isSuper ? ["*"] : Array.from(permsSet);

        let tenantId = user.tenantId ?? "";
        let companyCode = (user as any).tenant?.companyCode ?? tenantId;
        let businessMode = normalizeBusinessMode((user as any).tenant?.businessMode);
        let isInternalAdminTenant = false;
        if ((user as any).isSuperAdmin) {
          const internalTenant = await ensureInternalAdminTenant(user.id);
          tenantId = internalTenant.id;
          companyCode = internalTenant.companyCode ?? internalTenant.id;
          businessMode = normalizeBusinessMode(internalTenant.businessMode);
          isInternalAdminTenant = true;
        }

        // 登入只驗證身分與簽發 Session；基礎資料由登入後獨立 API 初始化。
        prisma.user
          .update({ where: { id: user.id }, data: { lastLoginAt: new Date(), lastLoginIp: ip } })
          .catch(() => {});
        prisma.loginLog.create({ data: { userId: user.id, username: user.username, success: true, ip } }).catch(() => {});

        return {
          id: user.id,
          tenantId,
          companyCode,
          name: user.name,
          email: user.email,
          username: user.username,
          roles,
          permissions,
          businessMode,
          isSuperAdmin: (user as any).isSuperAdmin,
          isInternalAdminTenant,
        } as any;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const u = user as any;
        token.uid = u.id;
        token.tenantId = u.tenantId;
        token.companyCode = u.companyCode;
        token.username = u.username;
        token.roles = u.roles;
        token.permissions = u.permissions;
        token.businessMode = u.businessMode;
        token.isSuperAdmin = u.isSuperAdmin;
        token.isInternalAdminTenant = u.isInternalAdminTenant;
      }
      if (token.isSuperAdmin && token.uid && !token.isInternalAdminTenant) {
        const internalTenant = await ensureInternalAdminTenant(token.uid);
        token.tenantId = internalTenant.id;
        token.companyCode = internalTenant.companyCode ?? internalTenant.id;
        token.businessMode = normalizeBusinessMode(internalTenant.businessMode);
        token.isInternalAdminTenant = true;
      }
      return token;
    },
    async session({ session, token }) {
      session.user = {
        id: token.uid,
        tenantId: token.tenantId,
        companyCode: token.companyCode,
        username: token.username,
        name: session.user?.name ?? "",
        email: session.user?.email ?? "",
        roles: token.roles ?? [],
        permissions: token.permissions ?? [],
        businessMode: token.businessMode ?? "ERP",
        isSuperAdmin: token.isSuperAdmin,
        isInternalAdminTenant: token.isInternalAdminTenant,
      };
      return session;
    },
  },
};

export function hasPermission(perms: string[] | undefined, code: string) {
  if (!perms || perms.length === 0) return false;
  if (perms.includes("*")) return true;
  if (perms.includes(code)) return true;
  const [mod] = code.split(".");
  return perms.includes(`${mod}.manage`);
}
