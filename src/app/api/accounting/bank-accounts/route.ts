import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, requireTenantId, audit } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission("cash.view");
  const tenantId = await requireTenantId();
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q") ?? "";
  const fromDate = sp.get("from") ?? "";
  const toDate = sp.get("to") ?? "";
  const where: any = q
    ? { tenantId, OR: [{ code: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }, { bankName: { contains: q, mode: "insensitive" } }] }
    : { tenantId };
  if (fromDate || toDate) {
    where.createdAt = {};
    if (fromDate) where.createdAt.gte = new Date(fromDate);
    if (toDate) {
      const end = new Date(toDate);
      end.setHours(23, 59, 59, 999);
      where.createdAt.lte = end;
    }
  }
  const items = await prisma.bankAccount.findMany({ where, orderBy: { code: "asc" } });
  return NextResponse.json({ items, total: items.length });
});

export const POST = apiHandler(async (req: NextRequest) => {
  const session = await requirePermission("cash.create");
  const tenantId = await requireTenantId();
  const body = await req.json();
  if (!body.code) throw new Error("請輸入帳戶編號");
  if (!body.name) throw new Error("請輸入帳戶名稱");
  const created = await prisma.bankAccount.create({
    data: {
      tenantId,
      code: body.code,
      name: body.name,
      bankName: body.bankName,
      accountNumber: body.accountNumber,
      accountType: body.accountType ?? "SAVINGS",
      branchName: body.branchName,
      swift: body.swift,
      balance: Number(body.balance ?? 0),
      isActive: body.isActive ?? true,
    },
  });
  await audit({ userId: session.user.id, action: "create", module: "bank-accounts", refId: created.id });
  return NextResponse.json(created);
});

export const PUT = apiHandler(async (req: NextRequest) => {
  const session = await requirePermission("cash.edit");
  const tenantId = await requireTenantId();
  const body = await req.json();
  if (!body.id) throw new Error("缺少帳戶 ID");
  const updated = await prisma.bankAccount.update({
    where: { id: body.id, tenantId },
    data: {
      code: body.code,
      name: body.name,
      bankName: body.bankName,
      accountNumber: body.accountNumber,
      accountType: body.accountType,
      branchName: body.branchName,
      swift: body.swift,
      balance: Number(body.balance),
      isActive: body.isActive,
    },
  });
  await audit({ userId: session.user.id, action: "update", module: "bank-accounts", refId: updated.id });
  return NextResponse.json(updated);
});

export const DELETE = apiHandler(async (req: NextRequest) => {
  const session = await requirePermission("cash.delete");
  const tenantId = await requireTenantId();
  const id = req.nextUrl.pathname.split("/").pop();
  if (!id) throw new Error("缺少帳戶 ID");
  await prisma.bankAccount.delete({ where: { id, tenantId } });
  await audit({ userId: session.user.id, action: "delete", module: "bank-accounts", refId: id });
  return NextResponse.json({ success: true });
});
