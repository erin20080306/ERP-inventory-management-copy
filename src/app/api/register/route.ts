import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { validateObjectForSQLInjection } from "@/lib/sql-validation";
import { ensureTenantBaseline } from "@/lib/tenant-baseline";

export async function POST(req: NextRequest) {
  try {
    if (process.env.LOCAL_LICENSE_MODE === "true") {
      return NextResponse.json({ error: "本機主機不接受公開註冊，請由公司管理者建立使用者" }, { status: 403 });
    }
    const { username, password, name, email, companyName, businessMode, acceptTerms } = await req.json();

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

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0] || req.headers.get("x-real-ip") || "unknown";

    const sqlValidation = validateObjectForSQLInjection({ username: normalizedUsername, name: normalizedName, email: normalizedEmail, companyName: normalizedCompanyName });
    if (!sqlValidation.isValid) {
      console.warn("SQL injection attempt detected:", sqlValidation.detectedFields);
      await prisma.auditLog.create({
        data: {
          userId: "system",
          action: "sql_injection_blocked",
          module: "security",
          detail: `註冊嘗試偵測到 SQL 注入: ${sqlValidation.detectedFields.join(", ")}`,
          ip,
        },
      });
      return NextResponse.json({ error: "輸入包含非法字符" }, { status: 400 });
    }

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
        { status: 409 },
      );
    }

    // 同一公司網路可能有多位使用者；只阻擋短時間大量建立，不以 IP 永久封鎖。
    if (ip !== "unknown") {
      const recentRegistrations = await prisma.user.count({
        where: {
          registrationIp: ip,
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      });
      if (recentRegistrations >= 3) {
        return NextResponse.json(
          { error: "此網路今日註冊次數已達上限，請聯絡艾琳設計協助開通" },
          { status: 429 },
        );
      }
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const acceptedAt = new Date();
    const adminRole = await prisma.role.findUnique({ where: { name: "系統管理員" }, select: { id: true } });
    if (!adminRole) {
      return NextResponse.json({ error: "系統角色尚未初始化，請聯絡艾琳設計" }, { status: 503 });
    }

    // 每個新公司第一個帳號固定為公司系統管理員，避免新租戶無法管理使用者與設定。
    const result = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: { name: normalizedCompanyName, businessMode: normalizedMode },
      });
      const user = await tx.user.create({
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
      await tx.userRole.create({ data: { userId: user.id, roleId: adminRole.id } });
      return { tenant, user };
    });

    // 與平台管理者使用同一套初始化流程；內容依 ERP／零售 POS／餐飲 POS 業態建立。
    await ensureTenantBaseline(result.tenant.id);

    return NextResponse.json({ success: true, username: result.user.username, email: result.user.email }, { status: 201 });
  } catch (err: any) {
    console.error("Register error:", err);
    return NextResponse.json({ error: "註冊失敗，請稍後再試" }, { status: 500 });
  }
}
