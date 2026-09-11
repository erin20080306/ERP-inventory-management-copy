import "./globals.css";
import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { Providers } from "@/components/providers";
import { SWRegister } from "@/components/sw-register";
import { currentRuntimeVersion } from "@/lib/runtime-version";
import { LOCALE_BCP47 } from "@/i18n/config";
import { normalizeLocale } from "@/i18n/locale";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return {
    title: t("title"),
    description: t("description"),
    applicationName: t("appName"),
    manifest: "/manifest.webmanifest",
    appleWebApp: {
      capable: true,
      title: t("appName"),
      statusBarStyle: "black-translucent",
    },
    icons: {
      icon: [{ url: "/icon-192", sizes: "192x192", type: "image/png" }],
      apple: [{ url: "/icon-192", sizes: "192x192", type: "image/png" }],
    },
    formatDetection: { telephone: false },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#4f46e5" },
    { media: "(prefers-color-scheme: dark)", color: "#0f172a" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = normalizeLocale(await getLocale());
  return (
    <html lang={LOCALE_BCP47[locale]} suppressHydrationWarning>
      <body>
        <NextIntlClientProvider>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
        <SWRegister initialVersion={currentRuntimeVersion()} />
      </body>
    </html>
  );
}
