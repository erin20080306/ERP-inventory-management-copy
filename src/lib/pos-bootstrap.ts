import { prisma } from "@/lib/prisma";
import {
  attachPosShiftOperators,
  getLedgerCashBalance,
  getPosDailySummary,
  getPosShiftCashPosition,
} from "@/lib/pos-daily-summary";

export type PosWorkspaceMode = "POS_RETAIL" | "POS_RESTAURANT" | "POS_MEDICAL";

export async function loadPosBootstrap(input: {
  tenantId: string;
  userId: string;
  mode: PosWorkspaceMode;
  canApproveCash: boolean;
  includeLedger?: boolean;
  includeRecentSales?: boolean;
  includeWarehouses?: boolean;
}) {
  const {
    tenantId,
    userId,
    mode,
    canApproveCash,
    includeLedger = mode !== "POS_MEDICAL",
    includeRecentSales = mode === "POS_RETAIL",
    includeWarehouses = mode === "POS_RETAIL",
  } = input;
  const registerScope = { mode };
  const openShiftPromise = prisma.posShift.findFirst({
    where: { tenantId, userId, status: "OPEN", register: registerScope },
    include: { register: { select: { id: true, code: true, name: true, mode: true, warehouseId: true } } },
    orderBy: { openedAt: "desc" },
  });
  const openShiftWithOperatorsPromise = openShiftPromise.then((shift) => attachPosShiftOperators(shift));
  const [registers, warehouses, openShift, today, shiftCash, ledgerCashBalance, recentSales, cashMovements] = await Promise.all([
    prisma.posRegister.findMany({
      where: { tenantId, mode, isActive: true },
      select: { id: true, code: true, name: true, mode: true, warehouse: { select: { id: true, code: true, name: true } } },
      orderBy: { code: "asc" },
    }),
    includeWarehouses
      ? prisma.warehouse.findMany({
          where: { tenantId, isActive: true },
          select: { id: true, code: true, name: true },
          orderBy: { code: "asc" },
        })
      : Promise.resolve([]),
    openShiftWithOperatorsPromise,
    getPosDailySummary(tenantId, prisma, { registerMode: mode }),
    openShiftPromise.then((shift) => getPosShiftCashPosition(shift)),
    includeLedger ? getLedgerCashBalance(tenantId) : Promise.resolve(null),
    includeRecentSales
      ? prisma.posSale.findMany({
          where: { tenantId, register: registerScope },
          take: 10,
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            number: true,
            total: true,
            status: true,
            createdAt: true,
            register: { select: { name: true } },
            customer: { select: { companyName: true } },
            refunds: { where: { status: "COMPLETED" }, select: { total: true } },
          },
        })
      : Promise.resolve([]),
    openShiftPromise.then((shift) => shift
      ? prisma.posCashMovement.findMany({
          where: { tenantId, shiftId: shift.id },
          orderBy: { requestedAt: "desc" },
          take: 100,
        })
      : []),
  ]);

  return {
    mode,
    registers,
    warehouses,
    openShift,
    today,
    shiftCash,
    ledgerCashBalance,
    cashMovements,
    capabilities: { canApproveCash },
    recentSales: recentSales.map((sale) => ({
      ...sale,
      refundedTotal: sale.refunds.reduce((sum, refund) => sum + Number(refund.total), 0),
    })),
    serverTime: new Date().toISOString(),
  };
}
