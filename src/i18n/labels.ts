"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";
import { DEFAULT_ROLES } from "@/lib/permissions";

/**
 * 系統預設角色的名稱會寫進資料庫，屬於主檔資料而非介面文字。
 * 這裡用「中文名稱 → 角色代碼」反查，讓預設角色可以顯示成英文，
 * 租戶自建的角色則原樣顯示，不會被誤譯。
 */
const ROLE_KEY_BY_SEEDED_NAME: Record<string, string> = Object.fromEntries(
  Object.entries(DEFAULT_ROLES).map(([key, definition]) => [definition.name, key]),
);

export function seededRoleKey(name: string | null | undefined) {
  if (!name) return null;
  return ROLE_KEY_BY_SEEDED_NAME[name.trim()] ?? null;
}

/** 取得角色顯示名稱；預設角色翻譯，自訂角色沿用使用者輸入。 */
export function useRoleLabel() {
  const t = useTranslations("roles");
  return useCallback(
    (name: string | null | undefined) => {
      const key = seededRoleKey(name);
      return key ? t(key) : (name ?? "");
    },
    [t],
  );
}

/** 權限模組顯示名稱；查無翻譯時回傳原始代碼，不讓畫面空白。 */
export function useModuleLabel() {
  const t = useTranslations("permissions.modules");
  return useCallback((module: string) => (t.has(module) ? t(module) : module), [t]);
}

/** 權限動作顯示名稱；查無翻譯時回傳原始代碼。 */
export function useActionLabel() {
  const t = useTranslations("permissions.actions");
  return useCallback((action: string) => (t.has(action) ? t(action) : action), [t]);
}
