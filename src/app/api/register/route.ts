import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { seedTenantDefaults } from "@/lib/seed-tenant";
import { validateObjectForSQLInjection } from "@/lib/sql-validation";
import { audit } from "@/lib/api";

export async function POST(req: NextRequest) {
  try {
    if (process.env.LOCAL_LICENSE_MODE === "true") {
      return NextResponse.json({ error: "本機主機不接受公開註冊，請由公司管理者建立使用者" }, { status: 403 });
    }
    const { username, password, name, email, roleName, companyName, businessMode, acceptTerms } = await req.json();

    if (!username || !password || !name || !email || !companyName) {
      return NextResponse.json({ error: "所有欄位皆為必填" }, { status: 400 });
    }

    const normalizedUsername = String(username).trim().toLowerCase();
    const normalizedEmail = String(email).trim().toLowerCase();
    const normalizedName = String(name).trim();
    const normalizedCompanyName = String(companyName).trim();
    if (normalizedUsername.length < 3 || normalizedUsername.length > 50 || /\s/.test(normalizedUsername)) {
      return NextResponse.json({ error: "帳號需為 3～50 個字元，且不可包含空白" }, { status: 400 });
    }
    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
      return NextResponse.json({ error: "Email 格式不正確" }, { status: 400 });
    }
    if (!normalizedName || !normalizedCompanyName) {
      return NextResponse.json({ error: "姓名與公司／店家名稱不可只有空白" }, { status: 400 });
    }

    if (acceptTerms !== true) {
      return NextResponse.json({ error: "請先閱讀並同意服務條款與隱私權政策" }, { status: 400 });
    }

    if (!/^(?=.*[A-Za-z])(?=.*\d).{8,72}$/.test(password)) {
      return NextResponse.json({ error: "密碼需為 8～72 個字元，且同時包含英文與數字" }, { status: 400 });
    }
    if (password !== password.trim()) {
      return NextResponse.json({ error: "密碼前後不可包含空白" }, { status: 400 });
    }

    const normalizedMode = businessMode === "POS_RESTAURANT"
      ? "POS_RESTAURANT"
      : businessMode === "POS_RETAIL" || businessMode === "POS"
        ? "POS_RETAIL"
        : "ERP";

    // 取得 IP 位址
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0] || req.headers.get('x-real-ip') || 'unknown';

    // SQL 注入檢測
    const sqlValidation = validateObjectForSQLInjection({ username: normalizedUsername, name: normalizedName, email: normalizedEmail, companyName: normalizedCompanyName });
    if (!sqlValidation.isValid) {
      console.warn("SQL injection attempt detected:", sqlValidation.detectedFields);
      // 記錄到稽核日誌（使用系統標記，因為還沒有 userId）
      await prisma.auditLog.create({
        data: {
          userId: "system",
          action: "sql_injection_blocked",
          module: "security",
          detail: `註冊嘗試偵測到 SQL 注入: ${sqlValidation.detectedFields.join(", ")}`,
          ip: ip,
        },
      });
      return NextResponse.json({ error: "輸入包含非法字符" }, { status: 400 });
    }

    // 檢查帳號是否已存在
    const existing = await prisma.user.findFirst({
      where: {
        OR: [
          { username: { equals: normalizedUsername, mode: "insensitive" } },
          { email: { equals: normalizedEmail, mode: "insensitive" } },
        ],
      },
    });
    if (existing) {
      return NextResponse.json(
        { error: existing.username.toLowerCase() === normalizedUsername ? "此帳號已被使用" : "此 Email 已被使用" },
        { status: 409 }
      );
    }

    // 同一公司網路可能有多位使用者；只阻擋短時間大量建立，不以 IP 永久封鎖。
    if (ip !== 'unknown') {
      const recentRegistrations = await prisma.user.count({
        where: {
          registrationIp: ip,
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      });
      if (recentRegistrations >= 3) {
        return NextResponse.json(
          { error: "此網路今日註冊次數已達上限，請聯絡艾琳設計協助開通" },
          { status: 429 }
        );
      }
    }

    const passwordHash = await bcrypt.hash(password, 12);

    // 建立租戶 + 使用者（一個交易）
    const tenant = await prisma.tenant.create({
      data: { name: normalizedCompanyName, businessMode: normalizedMode },
    });

    const acceptedAt = new Date();
    const user = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        username: normalizedUsername,
        name: normalizedName,
        email: normalizedEmail,
        passwordHash,
        trialStart: new Date(),
        isPaid: false,
        registrationIp: ip,
        lastLoginIp: ip,
        termsAcceptedAt: acceptedAt,
        privacyAcceptedAt: acceptedAt,
      },
    });

    // 指定角色（找不到指定角色則 fallback 為系統管理員）
    const targetRole = roleName || "系統管理員";
    let role = await prisma.role.findUnique({ where: { name: targetRole } });
    if (!role) {
      role = await prisma.role.findUnique({ where: { name: "系統管理員" } });
    }
    if (role) {
      await prisma.userRole.create({
        data: { userId: user.id, roleId: role.id },
      });
    }

    // 為新租戶建立預設資料（單一 transaction，已優化速度）
    await seedTenantDefaults(tenant.id);

    return NextResponse.json({ success: true, username: user.username, email: user.email }, { status: 201 });
  } catch (err: any) {
    console.error("Register error:", err);
    return NextResponse.json({ error: "註冊失敗，請稍後再試" }, { status: 500 });
  }
}
