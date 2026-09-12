-- 使用者介面語言偏好（zh-TW / en）。
-- 空值代表尚未選擇，改由瀏覽器 Accept-Language 與系統預設決定，
-- 因此既有帳號升級後行為完全不變。
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "locale" TEXT;
