import { getRequestConfig } from "next-intl/server";
import { LOCALE_BCP47 } from "./config";
import { resolveLocale } from "./locale";

// 採用 next-intl 的「無語言路由」模式：後台網址維持不變，
// 語言改由使用者設定、Cookie 與公開網址前綴決定。
export default getRequestConfig(async () => {
  const locale = await resolveLocale();
  return {
    locale,
    // 時區與時間格式跟著營運所在地，不跟著介面語言，避免報表日期被改寫。
    timeZone: process.env.NEXT_PUBLIC_APP_TIME_ZONE || "Asia/Taipei",
    formats: {
      dateTime: {
        short: { year: "numeric", month: "2-digit", day: "2-digit" },
        long: { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" },
      },
    },
    messages: (await import(`../../messages/${locale}.json`)).default,
    // 缺字時不要讓整頁崩潰，開發環境留下訊息以便補齊。
    onError(error) {
      if (process.env.NODE_ENV === "development") console.warn(`[i18n] ${error.message}`);
    },
    getMessageFallback({ key, namespace }) {
      return namespace ? `${namespace}.${key}` : key;
    },
  };
});

export { LOCALE_BCP47 };
