import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      username: string;
      name: string;
      email: string;
      roles: string[];
      permissions: string[];
    };
  }
}
declare module "next-auth/jwt" {
  interface JWT {
    uid: string;
    username: string;
    roles: string[];
    permissions: string[];
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

        if (!user || !user.isActive) {
          prisma.loginLog.create({ data: { username, success: false, ip } }).catch(() => {});
          return null;
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
        const permissions = isSuper ? ["*"] : Array.from(permsSet);

        // fire-and-forget：登入成功後續寫不阻塞 token 簽發
        prisma.user
          .update({ where: { id: user.id }, data: { lastLoginAt: new Date(), lastLoginIp: ip } })
          .catch(() => {});
        prisma.loginLog.create({ data: { userId: user.id, username, success: true, ip } }).catch(() => {});

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          username: user.username,
          roles,
          permissions,
        } as any;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const u = user as any;
        token.uid = u.id;
        token.username = u.username;
        token.roles = u.roles;
        token.permissions = u.permissions;
      }
      return token;
    },
    async session({ session, token }) {
      session.user = {
        id: token.uid,
        username: token.username,
        name: session.user?.name ?? "",
        email: session.user?.email ?? "",
        roles: token.roles ?? [],
        permissions: token.permissions ?? [],
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
