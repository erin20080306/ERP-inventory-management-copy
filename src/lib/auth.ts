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
      storeSlug?: string;
      username: string;
      name: string;
      email: string;
      roles: string[];
      permissions: string[];
      businessMode?: BusinessMode;
      isSuperAdmin?: boolean;
      isInternalAdminTenant?: boolean;
      isTenantOwner?: boolean;
    };
  }
}
declare module "next-auth/jwt" {
  interface JWT {
    uid: string;
    tenantId: string;
    companyCode?: string;
    storeSlug?: string;
    username: string;
    roles: string[];
    permissions: string[];
    businessMode?: BusinessMode;
    isSuperAdmin?: boolean;
    isInternalAdminTenant?: boolean;
    isTenantOwner?: boolean;
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
            tenant: {
              select: {
                businessMode: true,
                companyCode: true,
                companySettings: { select: { storeSlug: true }, take: 1 },
              },
            },
            userRoles: {
              include: { role: { include: { permissions: { include: { permission: true } } } } },
            },
          },
        });

        const logUsername = user?.username ?? identifier;

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
        for (const ur of user.userRoles as any[]) {
          for (const rp of ur.role.permissions as any[]) permsSet.add(rp.permission.code);
        }
        const permissions = user.isTenantOwner || user.isSuperAdmin ? ["*"] : Array.from(permsSet);

        let tenantId = user.tenantId ?? "";
        let companyCode = (user as any).tenant?.companyCode ?? tenantId;
        let storeSlug = (user as any).tenant?.companySettings?.[0]?.storeSlug ?? undefined;
        let businessMode = normalizeBusinessMode((user as any).tenant?.businessMode);
        let isInternalAdminTenant = false;
        if ((user as any).isSuperAdmin) {
          const internalTenant = await ensureInternalAdminTenant(user.id);
          tenantId = internalTenant.id;
          companyCode = internalTenant.companyCode ?? internalTenant.id;
          storeSlug = (await prisma.companySetting.findFirst({
            where: { tenantId: internalTenant.id },
            select: { storeSlug: true },
          }))?.storeSlug ?? undefined;
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
          storeSlug,
          name: user.name,
          email: user.email,
          username: user.username,
          roles,
          permissions,
          businessMode,
          isSuperAdmin: (user as any).isSuperAdmin,
          isInternalAdminTenant,
          isTenantOwner: user.isTenantOwner,
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
        token.storeSlug = u.storeSlug;
        token.username = u.username;
        token.roles = u.roles;
        token.permissions = u.permissions;
        token.businessMode = u.businessMode;
        token.isSuperAdmin = u.isSuperAdmin;
        token.isInternalAdminTenant = u.isInternalAdminTenant;
        token.isTenantOwner = u.isTenantOwner;
      }
      if (token.uid && token.isTenantOwner === undefined) {
        const persistedUser = await prisma.user.findUnique({
          where: { id: token.uid },
          select: { isTenantOwner: true },
        });
        token.isTenantOwner = persistedUser?.isTenantOwner ?? false;
      }
      if (token.isSuperAdmin && token.uid && !token.isInternalAdminTenant) {
        const internalTenant = await ensureInternalAdminTenant(token.uid);
        token.tenantId = internalTenant.id;
        token.companyCode = internalTenant.companyCode ?? internalTenant.id;
        token.storeSlug = (await prisma.companySetting.findFirst({
          where: { tenantId: internalTenant.id },
          select: { storeSlug: true },
        }))?.storeSlug ?? undefined;
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
        storeSlug: token.storeSlug,
        username: token.username,
        name: session.user?.name ?? "",
        email: session.user?.email ?? "",
        roles: token.roles ?? [],
        permissions: token.permissions ?? [],
        businessMode: token.businessMode ?? "ERP",
        isSuperAdmin: token.isSuperAdmin,
        isInternalAdminTenant: token.isInternalAdminTenant,
        isTenantOwner: token.isTenantOwner,
      };
      return session;
    },
  },
};

export { hasPermission } from "./permissions";
