import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, requireTenantId, audit } from "@/lib/api";
import { prisma } from "@/lib/prisma";

// 還原時的清空順序 (反向: 從子到父，避免外鍵衝突)
const TRUNCATE_ORDER = [
  "auditLog", "loginLog",
  "fixedAsset",
  "attendanceRecord",
  "payrollItem", "payroll", "payrollPeriod",
  "employee", "department",
  "notePayable", "noteReceivable",
  "invoiceItem", "invoice",
  "supplierPayment", "accountsPayable",
  "receivePayment", "accountsReceivable",
  "journalEntryLine", "journalEntry",
  "purchaseReturnItem", "purchaseReturn",
  "salesReturnItem", "salesReturn",
  "stockTransferItem", "stockTransfer",
  "stockAdjustmentItem", "stockAdjustment",
  "inventoryTransaction", "inventoryStock",
  "quotationItem", "quotation",
  "salesOrderItem", "salesOrder",
  "purchaseOrderItem", "purchaseOrder",
  "bankTransaction", "cashTransaction",
  "bankAccount", "cashAccount",
  "supplier", "customer",
  "product", "productUnit", "productCategory",
  "warehouse", "chartOfAccount", "taxRate",
  "numberSequence", "systemSetting", "companySetting",
  "userRole", "user",
  "rolePermission", "role", "permission",
];

const RESTORE_ORDER = [...TRUNCATE_ORDER].reverse();

// 不含 tenantId 的系統表
const SYSTEM_TABLES = new Set(["permission", "role", "rolePermission"]);

export const POST = apiHandler(async (req: NextRequest) => {
  const session = await requirePermission("settings.manage");
  const tenantId = await requireTenantId();
  const body = await req.json();
  if (!body.tables || typeof body.tables !== "object") throw new Error("備份檔格式錯誤");

  // 還原邏輯：先清空 → 再依序匯入
  const counts: Record<string, number> = {};

  await prisma.$transaction(
    async (tx) => {
      for (const t of TRUNCATE_ORDER) {
        try {
          // @ts-ignore
          const where = SYSTEM_TABLES.has(t) ? {} : { tenantId };
          await (tx as any)[t].deleteMany({ where });
        } catch {}
      }
      for (const t of RESTORE_ORDER) {
        const rows = body.tables[t];
        if (!Array.isArray(rows) || rows.length === 0) continue;
        try {
          // @ts-ignore
          const r = await (tx as any)[t].createMany({ data: rows, skipDuplicates: true });
          counts[t] = r.count ?? rows.length;
        } catch (e: any) {
          counts[t] = -1;
        }
      }
    },
    { maxWait: 30000, timeout: 120000 }
  );

  await audit({ userId: session.user.id, action: "restore_backup", module: "settings" });
  return NextResponse.json({ ok: true, counts });
});
