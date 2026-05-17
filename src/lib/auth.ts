import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      tenantId: string;
      username: string;
      name: string;
      email: string;
      roles: string[];
      permissions: string[];
      isSuperAdmin?: boolean;
    };
  }
}
declare module "next-auth/jwt" {
  interface JWT {
    uid: string;
    tenantId: string;
    username: string;
    roles: string[];
    permissions: string[];
    isSuperAdmin?: boolean;
  }
}

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt", maxAge: 60 * 60 * 8 }, // 8 小時
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
        const username = credentials.username.trim();
        const ip = (req?.headers?.["x-forwarded-for"] as string) || "";

        // 並行：失敗計數 + 使用者查詢 (節省一個 DB 來回時間)
        const since = new Date(Date.now() - 15 * 60 * 1000);
        const [recentFails, user] = await Promise.all([
          prisma.loginLog.count({ where: { username, success: false, createdAt: { gte: since } } }),
          prisma.user.findUnique({
            where: { username },
            include: {
              userRoles: {
                include: { role: { include: { permissions: { include: { permission: true } } } } },
              },
            },
          }),
        ]);

        if (recentFails >= 5) {
          prisma.loginLog
            .create({ data: { username, success: false, ip, userAgent: req?.headers?.["user-agent"] as string } })
            .catch(() => {});
          throw new Error("登入失敗次數過多，請 15 分鐘後再試");
        }

        if (!user) {
          prisma.loginLog.create({ data: { username, success: false, ip } }).catch(() => {});
          return null;
        }

        if (!user.isActive) {
          prisma.loginLog.create({ data: { username, success: false, ip } }).catch(() => {});
          throw new Error("帳號已被鎖定，請聯繫管理員或完成付款後解鎖");
        }

        const ok = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!ok) {
          prisma.loginLog.create({ data: { userId: user.id, username, success: false, ip } }).catch(() => {});
          return null;
        }

        const roles = (user.userRoles as any[]).map((ur) => ur.role.name);
        const permsSet = new Set<string>();
        let isSuper = false;
        for (const ur of user.userRoles as any[]) {
          if (ur.role.name === "系統管理員") isSuper = true;
          for (const rp of ur.role.permissions as any[]) permsSet.add(rp.permission.code);
        }
        // 超級管理員（平台管理員）擁有所有權限
        if ((user as any).isSuperAdmin) isSuper = true;
        // 租戶用戶沒有角色時，給予所有模組查看權限
        if (!isSuper && permsSet.size === 0 && user.tenantId) {
          permsSet.add("*");
        }
        const permissions = isSuper ? ["*"] : Array.from(permsSet);

        // fire-and-forget：登入成功後續寫不阻塞 token 簽發
        prisma.user
          .update({ where: { id: user.id }, data: { lastLoginAt: new Date(), lastLoginIp: ip } })
          .catch(() => {});
        prisma.loginLog.create({ data: { userId: user.id, username, success: true, ip } }).catch(() => {});

        return {
          id: user.id,
          tenantId: user.tenantId ?? "",
          name: user.name,
          email: user.email,
          username: user.username,
          roles,
          permissions,
          isSuperAdmin: (user as any).isSuperAdmin,
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
        token.username = u.username;
        token.roles = u.roles;
        token.permissions = u.permissions;
        token.isSuperAdmin = u.isSuperAdmin;
      }
      return token;
    },
    async session({ session, token }) {
      session.user = {
        id: token.uid,
        tenantId: token.tenantId,
        username: token.username,
        name: session.user?.name ?? "",
        email: session.user?.email ?? "",
        roles: token.roles ?? [],
        permissions: token.permissions ?? [],
        isSuperAdmin: token.isSuperAdmin,
      };
      return session;
    },
  },
};

export function hasPermission(perms: string[] | undefined, code: string) {
  if (!perms || perms.length === 0) return false;
  if (perms.includes("*")) return true;
  if (perms.includes(code)) return true;
  // module.manage 視為該模組所有動作
  const [mod] = code.split(".");
  return perms.includes(`${mod}.manage`);
}
