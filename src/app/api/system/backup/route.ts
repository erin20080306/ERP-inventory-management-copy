import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, requireTenantId, audit } from "@/lib/api";
import { prisma } from "@/lib/prisma";

// 備份順序：依外鍵相依性，匯出時不影響；還原時須依此順序匯入
const BACKUP_TABLES = [
  "permission", "role", "rolePermission", "user", "userRole",
  "companySetting", "systemSetting", "numberSequence", "taxRate",
  "chartOfAccount", "warehouse", "productCategory", "productUnit",
  "product", "customer", "supplier",
  "cashAccount", "bankAccount", "cashTransaction", "bankTransaction",
  "purchaseOrder", "purchaseOrderItem",
  "salesOrder", "salesOrderItem",
  "quotation", "quotationItem",
  "inventoryStock", "inventoryTransaction",
  "stockAdjustment", "stockAdjustmentItem",
  "stockTransfer", "stockTransferItem",
  "salesReturn", "salesReturnItem",
  "purchaseReturn", "purchaseReturnItem",
  "journalEntry", "journalEntryLine",
  "accountsReceivable", "receivePayment",
  "accountsPayable", "supplierPayment",
  "noteReceivable", "notePayable",
  "fixedAsset",
  "department", "employee",
  "payrollPeriod", "payroll", "payrollItem",
  "attendanceRecord",
  "invoice", "invoiceItem",
  "loginLog", "auditLog",
] as const;

// 不含 tenantId 的系統表
const SYSTEM_TABLES = new Set(["permission", "role", "rolePermission"]);

export const GET = apiHandler(async (_req: NextRequest) => {
  const session = await requirePermission("settings.export");
  const tenantId = await requireTenantId();
  const dump: Record<string, any[]> = {};
  for (const t of BACKUP_TABLES) {
    try {
      // @ts-ignore - dynamic table access
      const where = SYSTEM_TABLES.has(t) ? {} : { tenantId };
      const rows = await (prisma as any)[t].findMany({ where });
      dump[t] = rows;
    } catch (e) {
      dump[t] = [];
    }
  }
  await audit({ userId: session.user.id, action: "export_backup", module: "settings" });
  const body = JSON.stringify({
    version: 1,
    generatedAt: new Date().toISOString(),
    tables: dump,
  });
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="erp-backup-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
});
