"use client";
import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "next-themes";
import { SWRConfig } from "swr";
import { Toaster } from "sonner";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <SWRConfig value={{ revalidateOnFocus: false, revalidateOnReconnect: true, dedupingInterval: 15000, focusThrottleInterval: 30000 }}>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
          {children}
          <Toaster richColors position="top-right" closeButton />
        </ThemeProvider>
      </SWRConfig>
    </SessionProvider>
  );
}
