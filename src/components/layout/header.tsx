"use client";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Moon, Sun, LogOut, UserCircle2, Shield } from "lucide-react";
import { useEffect, useState } from "react";
import { MobileSidebar } from "./mobile-sidebar";

export function Header() {
  const { data } = useSession();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background/80 backdrop-blur px-6">
      <MobileSidebar />
      <div className="flex-1" />
      {mounted && (
        <Button variant="ghost" size="icon" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label="切換主題">
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
      )}
      <div className="flex items-center gap-2 text-sm">
        <UserCircle2 className="h-5 w-5 text-muted-foreground" />
        <div className="hidden sm:flex flex-col">
          <span className="font-medium leading-tight">{data?.user?.name ?? "未登入"}</span>
          <span className="text-[11px] text-muted-foreground leading-tight">
            {data?.user?.roles?.join(" / ") || "—"}
          </span>
        </div>
      </div>
      {(data?.user as any)?.isSuperAdmin && (
        <Button variant="outline" size="sm" onClick={() => window.location.href = "/admin"}>
          <Shield className="h-4 w-4" />
          後台
        </Button>
      )}
      <Button variant="outline" size="sm" onClick={() => signOut({ callbackUrl: "/login" })}>
        <LogOut className="h-4 w-4" />
        登出
      </Button>
    </header>
  );
}
