import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { seedTenantDefaults } from "@/lib/seed-tenant";

export async function POST(req: NextRequest) {
  try {
    const { username, password, name, email, roleName, companyName } = await req.json();

    if (!username || !password || !name || !email) {
      return NextResponse.json({ error: "所有欄位皆為必填" }, { status: 400 });
    }

    if (password.length < 4) {
      return NextResponse.json({ error: "密碼至少 4 個字元" }, { status: 400 });
    }

    // 檢查帳號是否已存在
    const existing = await prisma.user.findFirst({
      where: { OR: [{ username }, { email }] },
    });
    if (existing) {
      return NextResponse.json(
        { error: existing.username === username ? "此帳號已被使用" : "此 Email 已被使用" },
        { status: 409 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);

    // 建立租戶 + 使用者（一個交易）
    const tenant = await prisma.tenant.create({
      data: { name: companyName || "我的公司" },
    });

    const user = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        username,
        name,
        email,
        passwordHash,
        trialStart: new Date(),
        isPaid: false,
      },
    });

    // 指定角色
    const targetRole = roleName || "系統管理員";
    const role = await prisma.role.findUnique({ where: { name: targetRole } });
    if (role) {
      await prisma.userRole.create({
        data: { userId: user.id, roleId: role.id },
      });
    }

    // 為新租戶建立預設資料（單一 transaction，已優化速度）
    await seedTenantDefaults(tenant.id);

    return NextResponse.json({ success: true, username: user.username });
  } catch (err: any) {
    console.error("Register error:", err);
    return NextResponse.json({ error: "註冊失敗，請稍後再試" }, { status: 500 });
  }
}
