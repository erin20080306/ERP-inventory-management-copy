-- 修正示範電商商品名稱，使名稱與既有黃色連帽休閒套裝圖片一致。
-- 僅更新仍保留舊示範名稱的 EC-P005，不覆寫租戶自行修改過的商品。
UPDATE "Product"
SET "name" = '亮黃連帽休閒套裝',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "sku" = 'EC-P005'
  AND "name" = '亞麻混紡長洋裝';

UPDATE "ProductCategory"
SET "name" = '套裝',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" = 'EC-DRESS'
  AND "name" = '洋裝';
