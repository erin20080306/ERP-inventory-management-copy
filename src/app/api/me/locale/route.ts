import { NextResponse } from "next/server";
import { getSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { LOCALE_COOKIE, isLocale, LOCALES } from "@/i18n/config";

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/**
 * 儲存介面語言偏好。
 * 登入者寫入資料庫並同步 Cookie；未登入者（登入頁、官網）只寫 Cookie。
 * 任何使用者都只能改自己的語言，不需要額外權限。
 */
export async function PUT(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  const locale = (payload as { locale?: unknown } | null)?.locale;
  if (!isLocale(locale)) {
    return NextResponse.json({ error: "UNSUPPORTED_LOCALE", supported: LOCALES }, { status: 400 });
  }

  const session = await getSession();
  let persisted = false;
  if (session?.user?.id) {
    try {
      await prisma.user.update({ where: { id: session.user.id }, data: { locale } });
      persisted = true;
    } catch {
      // 寫入失敗不阻擋切換：Cookie 仍會生效，只是換裝置時不會跟著走。
      persisted = false;
    }
  }

  const response = NextResponse.json({ locale, persisted });
  response.cookies.set({
    name: LOCALE_COOKIE,
    value: locale,
    path: "/",
    maxAge: COOKIE_MAX_AGE_SECONDS,
    sameSite: "lax",
    // 前端切換器需要讀得到目前語言，因此不設 httpOnly；此值不含個資。
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}
