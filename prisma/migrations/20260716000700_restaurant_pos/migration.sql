CREATE TYPE "RestaurantTableStatus" AS ENUM ('AVAILABLE', 'OCCUPIED', 'RESERVED', 'CLEANING');
CREATE TYPE "RestaurantOrderStatus" AS ENUM ('OPEN', 'SENT', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED');
CREATE TYPE "RestaurantItemStatus" AS ENUM ('PENDING', 'SENT', 'PREPARING', 'READY', 'SERVED', 'CANCELLED');
CREATE TYPE "RestaurantTicketStatus" AS ENUM ('NEW', 'PREPARING', 'READY', 'SERVED', 'CANCELLED');

CREATE TABLE "RestaurantArea" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RestaurantArea_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RestaurantTable" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "areaId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "seats" INTEGER NOT NULL DEFAULT 4,
  "status" "RestaurantTableStatus" NOT NULL DEFAULT 'AVAILABLE',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RestaurantTable_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RestaurantOrder" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "tableId" TEXT NOT NULL,
  "shiftId" TEXT NOT NULL,
  "registerId" TEXT NOT NULL,
  "posSaleId" TEXT,
  "number" TEXT NOT NULL,
  "status" "RestaurantOrderStatus" NOT NULL DEFAULT 'OPEN',
  "guests" INTEGER NOT NULL DEFAULT 1,
  "note" TEXT,
  "createdById" TEXT NOT NULL,
  "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sentAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RestaurantOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RestaurantOrderItem" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "quantity" DECIMAL(18,4) NOT NULL,
  "unitPrice" DECIMAL(18,4) NOT NULL,
  "note" TEXT,
  "course" TEXT,
  "status" "RestaurantItemStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RestaurantOrderItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RestaurantKitchenTicket" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "number" TEXT NOT NULL,
  "station" TEXT NOT NULL DEFAULT '主廚房',
  "status" "RestaurantTicketStatus" NOT NULL DEFAULT 'NEW',
  "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt" TIMESTAMP(3),
  "readyAt" TIMESTAMP(3),
  "servedAt" TIMESTAMP(3),
  CONSTRAINT "RestaurantKitchenTicket_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RestaurantKitchenTicketItem" (
  "ticketId" TEXT NOT NULL,
  "orderItemId" TEXT NOT NULL,
  CONSTRAINT "RestaurantKitchenTicketItem_pkey" PRIMARY KEY ("ticketId", "orderItemId")
);

CREATE UNIQUE INDEX "RestaurantArea_tenantId_code_key" ON "RestaurantArea"("tenantId", "code");
CREATE INDEX "RestaurantArea_tenantId_isActive_sortOrder_idx" ON "RestaurantArea"("tenantId", "isActive", "sortOrder");
CREATE UNIQUE INDEX "RestaurantTable_tenantId_code_key" ON "RestaurantTable"("tenantId", "code");
CREATE INDEX "RestaurantTable_tenantId_status_isActive_idx" ON "RestaurantTable"("tenantId", "status", "isActive");
CREATE INDEX "RestaurantTable_areaId_sortOrder_idx" ON "RestaurantTable"("areaId", "sortOrder");
CREATE UNIQUE INDEX "RestaurantOrder_posSaleId_key" ON "RestaurantOrder"("posSaleId");
CREATE UNIQUE INDEX "RestaurantOrder_tenantId_number_key" ON "RestaurantOrder"("tenantId", "number");
CREATE INDEX "RestaurantOrder_tenantId_status_openedAt_idx" ON "RestaurantOrder"("tenantId", "status", "openedAt");
CREATE INDEX "RestaurantOrder_tableId_status_idx" ON "RestaurantOrder"("tableId", "status");
CREATE INDEX "RestaurantOrder_shiftId_status_idx" ON "RestaurantOrder"("shiftId", "status");
CREATE INDEX "RestaurantOrderItem_orderId_status_idx" ON "RestaurantOrderItem"("orderId", "status");
CREATE INDEX "RestaurantOrderItem_productId_idx" ON "RestaurantOrderItem"("productId");
CREATE UNIQUE INDEX "RestaurantKitchenTicket_tenantId_number_key" ON "RestaurantKitchenTicket"("tenantId", "number");
CREATE INDEX "RestaurantKitchenTicket_tenantId_status_sentAt_idx" ON "RestaurantKitchenTicket"("tenantId", "status", "sentAt");
CREATE INDEX "RestaurantKitchenTicket_orderId_sentAt_idx" ON "RestaurantKitchenTicket"("orderId", "sentAt");
CREATE INDEX "RestaurantKitchenTicketItem_orderItemId_idx" ON "RestaurantKitchenTicketItem"("orderItemId");

ALTER TABLE "RestaurantArea" ADD CONSTRAINT "RestaurantArea_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RestaurantTable" ADD CONSTRAINT "RestaurantTable_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RestaurantTable" ADD CONSTRAINT "RestaurantTable_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "RestaurantArea"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RestaurantOrder" ADD CONSTRAINT "RestaurantOrder_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RestaurantOrder" ADD CONSTRAINT "RestaurantOrder_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "RestaurantTable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RestaurantOrder" ADD CONSTRAINT "RestaurantOrder_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "PosShift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RestaurantOrder" ADD CONSTRAINT "RestaurantOrder_registerId_fkey" FOREIGN KEY ("registerId") REFERENCES "PosRegister"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RestaurantOrder" ADD CONSTRAINT "RestaurantOrder_posSaleId_fkey" FOREIGN KEY ("posSaleId") REFERENCES "PosSale"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RestaurantOrderItem" ADD CONSTRAINT "RestaurantOrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "RestaurantOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RestaurantOrderItem" ADD CONSTRAINT "RestaurantOrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RestaurantKitchenTicket" ADD CONSTRAINT "RestaurantKitchenTicket_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RestaurantKitchenTicket" ADD CONSTRAINT "RestaurantKitchenTicket_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "RestaurantOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RestaurantKitchenTicketItem" ADD CONSTRAINT "RestaurantKitchenTicketItem_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "RestaurantKitchenTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RestaurantKitchenTicketItem" ADD CONSTRAINT "RestaurantKitchenTicketItem_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "RestaurantOrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "Permission" ("id", "code", "module", "action", "description")
SELECT 'perm-' || md5(module || '.' || action), module || '.' || action, module, action, module || ' - ' || action
FROM (VALUES ('pos'), ('restaurant')) AS modules(module)
CROSS JOIN (VALUES ('view'), ('create'), ('edit'), ('delete'), ('export'), ('submit'), ('approve'), ('reject'), ('post'), ('void'), ('manage')) AS actions(action)
ON CONFLICT ("code") DO UPDATE SET "module" = EXCLUDED."module", "action" = EXCLUDED."action", "description" = EXCLUDED."description";

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id"
FROM "Role" role CROSS JOIN "Permission" permission
WHERE role."name" IN ('系統管理員', '老闆 / 經營者') AND permission."module" IN ('pos', 'restaurant')
ON CONFLICT DO NOTHING;

INSERT INTO "Role" ("id", "name", "description", "isSystem", "createdAt", "updatedAt") VALUES
  ('role-pos-cashier', 'POS 收銀員', '僅 POS 前台與必要銷售操作', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('role-restaurant-service', '餐飲外場人員', '桌位點餐、送廚與結帳', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('role-kitchen', '廚房人員', '僅查看與更新廚房出餐狀態', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id"
FROM "Role" role CROSS JOIN "Permission" permission
WHERE
  (role."name" = 'POS 收銀員' AND permission."module" IN ('dashboard', 'pos', 'products', 'customers', 'sales', 'returns') AND permission."action" NOT IN ('delete', 'approve', 'manage'))
  OR (role."name" = '餐飲外場人員' AND permission."module" IN ('dashboard', 'pos', 'restaurant', 'products', 'customers', 'sales') AND permission."action" NOT IN ('delete', 'approve', 'manage'))
  OR (role."name" = '廚房人員' AND permission."module" = 'restaurant' AND permission."action" IN ('view', 'edit'))
ON CONFLICT DO NOTHING;
