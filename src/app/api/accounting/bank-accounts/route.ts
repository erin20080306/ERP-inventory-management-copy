import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, requireTenantId, audit } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission("cash.view");
  const tenantId = await requireTenantId();
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q") ?? "";
  const where: any = q
    ? { tenantId, OR: [{ code: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }, { bankName: { contains: q, mode: "insensitive" } }] }
    : { tenantId };
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
