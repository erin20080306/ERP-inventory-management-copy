CREATE TABLE "CustomColumnDefinition" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'text',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CustomColumnDefinition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomFieldValue" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "rowId" TEXT NOT NULL,
    "columnId" TEXT NOT NULL,
    "value" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CustomFieldValue_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CustomColumnDefinition_tenantId_module_sortOrder_idx" ON "CustomColumnDefinition"("tenantId", "module", "sortOrder");
CREATE UNIQUE INDEX "CustomColumnDefinition_tenantId_module_label_key" ON "CustomColumnDefinition"("tenantId", "module", "label");
CREATE UNIQUE INDEX "CustomFieldValue_tenantId_module_rowId_columnId_key" ON "CustomFieldValue"("tenantId", "module", "rowId", "columnId");
CREATE INDEX "CustomFieldValue_tenantId_module_rowId_idx" ON "CustomFieldValue"("tenantId", "module", "rowId");
CREATE INDEX "CustomFieldValue_columnId_idx" ON "CustomFieldValue"("columnId");

ALTER TABLE "CustomColumnDefinition" ADD CONSTRAINT "CustomColumnDefinition_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomFieldValue" ADD CONSTRAINT "CustomFieldValue_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomFieldValue" ADD CONSTRAINT "CustomFieldValue_columnId_fkey" FOREIGN KEY ("columnId") REFERENCES "CustomColumnDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
