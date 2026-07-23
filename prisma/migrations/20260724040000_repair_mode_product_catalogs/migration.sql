-- 再次收緊既有商品的模式歸屬，避免舊版未分類商品混入其他營運模式。
UPDATE "Product"
SET "catalogMode" = 'POS_RETAIL'
WHERE "sku" IN (
  'RTL-P001', 'RTL-P002', 'RTL-P003', 'RTL-P004', 'RTL-P005', 'RTL-P006',
  'RTL-P007', 'RTL-P008', 'RTL-P009', 'RTL-P010', 'RTL-P011', 'RTL-P012'
)
OR "name" IN ('香精油蠟燭', '木質調香氛蠟燭', '不鏽鋼保溫杯');

UPDATE "Product"
SET "catalogMode" = 'POS_RESTAURANT'
WHERE "sku" IN (
  'F001', 'F002', 'F003', 'F004', 'F005', 'F006', 'F007',
  'D001', 'D002', 'D003', 'D004', 'D005'
);

UPDATE "Product"
SET "catalogMode" = 'ECOMMERCE'
WHERE "sku" IN (
  'EC-P001', 'EC-P002', 'EC-P003', 'EC-P004', 'EC-P005', 'EC-P006',
  'EC-P007', 'EC-P008', 'EC-P009', 'EC-P010', 'EC-P011', 'EC-P012'
);

-- 系統基礎商品在 v4 初始化時會補齊；既有同代碼商品先恢復可見。
UPDATE "Product"
SET "isArchived" = false
WHERE "sku" IN (
  'RTL-P001', 'RTL-P002', 'RTL-P003', 'RTL-P004', 'RTL-P005', 'RTL-P006',
  'RTL-P007', 'RTL-P008', 'RTL-P009', 'RTL-P010', 'RTL-P011', 'RTL-P012',
  'F001', 'F002', 'F003', 'F004', 'F005', 'F006', 'F007',
  'D001', 'D002', 'D003', 'D004', 'D005',
  'EC-P001', 'EC-P002', 'EC-P003', 'EC-P004', 'EC-P005', 'EC-P006',
  'EC-P007', 'EC-P008', 'EC-P009', 'EC-P010', 'EC-P011', 'EC-P012'
);
