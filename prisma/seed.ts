import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { ALL_PERMISSIONS, DEFAULT_ROLES } from "../src/lib/permissions";
import { STANDARD_ACCOUNTS } from "./standard-accounts";

const prisma = new PrismaClient();

async function main() {
  console.log("→ 種子權限資料 ...");
  for (const p of ALL_PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: p.code },
      update: { module: p.module, action: p.action, description: p.description },
      create: p,
    });
  }
  const allPerms = await prisma.permission.findMany();

  console.log("→ 種子角色 ...");
  for (const [key, def] of Object.entries(DEFAULT_ROLES)) {
    const role = await prisma.role.upsert({
      where: { name: def.name },
      update: {},
      create: { name: def.name, description: key, isSystem: key === "SUPER_ADMIN" },
    });
    const codes = def.permissions === "*" ? allPerms.map((p: any) => p.code) : def.permissions;
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: allPerms
        .filter((p: any) => codes.includes(p.code))
        .map((p: any) => ({ roleId: role.id, permissionId: p.id })),
      skipDuplicates: true,
    });
  }

  console.log("→ 建立預設管理員 admin ...");
  const adminUser = process.env.ADMIN_USERNAME || "admin";
  const adminPwd = process.env.ADMIN_PASSWORD || "000000";
  const adminEmail = process.env.ADMIN_EMAIL || "admin@example.com";
  const hash = await bcrypt.hash(adminPwd, 12);

  const admin = await prisma.user.upsert({
    where: { username: adminUser },
    update: { passwordHash: hash, name: "系統管理員", email: adminEmail, isActive: true },
    create: { username: adminUser, name: "系統管理員", email: adminEmail, passwordHash: hash },
  });
  const superRole = await prisma.role.findUnique({ where: { name: "系統管理員" } });
  if (superRole) {
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: admin.id, roleId: superRole.id } },
      update: {},
      create: { userId: admin.id, roleId: superRole.id },
    });
  }

  console.log("→ 公司基本資料 ...");
  const existing = await prisma.companySetting.findFirst();
  if (!existing) {
    await prisma.companySetting.create({
      data: { name: "示範公司股份有限公司", taxId: "12345678", currency: "TWD", phone: "02-0000-0000", email: "info@example.com" },
    });
  }

  console.log("→ 編號規則 ...");
  const seqs = ["PO", "SO", "QT", "JE", "RP", "SP", "SR", "PR", "ADJ", "TRF", "INV"];
  for (const k of seqs) {
    await prisma.numberSequence.upsert({
      where: { key: k },
      update: {},
      create: { key: k, prefix: k },
    });
  }

  console.log("→ 稅率 ...");
  const tax5 = await prisma.taxRate.upsert({
    where: { code: "VAT5" },
    update: {},
    create: { code: "VAT5", name: "營業稅 5%", rate: 0.05, region: "TW" },
  });
  await prisma.taxRate.upsert({
    where: { code: "ZERO" },
    update: {},
    create: { code: "ZERO", name: "零稅率", rate: 0, region: "TW" },
  });

  console.log(`→ 標準會計科目 (${STANDARD_ACCOUNTS.length} 條) ...`);
  for (const a of STANDARD_ACCOUNTS) {
    await prisma.chartOfAccount.upsert({
      where: { code: a.code },
      update: { name: a.name, type: a.type },
      create: { code: a.code, name: a.name, type: a.type },
    });
  }

  console.log("→ 倉庫 ...");
  const wh = await prisma.warehouse.upsert({
    where: { code: "WH-MAIN" },
    update: {},
    create: { code: "WH-MAIN", name: "主倉庫" },
  });

  console.log("→ 商品分類 / 單位 ...");
  const cat = await prisma.productCategory.upsert({
    where: { code: "GEN" },
    update: {},
    create: { code: "GEN", name: "一般商品" },
  });
  const unit = await prisma.productUnit.upsert({
    where: { code: "PCS" },
    update: {},
    create: { code: "PCS", name: "個" },
  });

  console.log("→ 範例商品 ...");
  const products = [
    { sku: "P001", name: "範例商品 A", costPrice: 80, salePrice: 120, safetyStock: 10 },
    { sku: "P002", name: "範例商品 B", costPrice: 200, salePrice: 320, safetyStock: 5 },
    { sku: "P003", name: "範例商品 C", costPrice: 1500, salePrice: 2200, safetyStock: 2 },
  ];
  for (const p of products) {
    const prod = await prisma.product.upsert({
      where: { sku: p.sku },
      update: {},
      create: { ...p, categoryId: cat.id, unitId: unit.id, taxRateId: tax5.id },
    });
    await prisma.inventoryStock.upsert({
      where: { productId_warehouseId: { productId: prod.id, warehouseId: wh.id } },
      update: {},
      create: { productId: prod.id, warehouseId: wh.id, quantity: 50 },
    });
  }

  console.log("→ 範例客戶 / 供應商 ...");
  await prisma.customer.upsert({
    where: { code: "C001" },
    update: {},
    create: { code: "C001", companyName: "範例客戶有限公司", taxId: "11111111", contactName: "陳先生", phone: "02-1111-1111", email: "c1@example.com" },
  });
  await prisma.supplier.upsert({
    where: { code: "S001" },
    update: {},
    create: { code: "S001", companyName: "範例供應商有限公司", taxId: "22222222", contactName: "林小姐", phone: "02-2222-2222", email: "s1@example.com" },
  });

  console.log("→ 現金 / 銀行帳戶 ...");
  await prisma.cashAccount.upsert({
    where: { code: "CASH-01" },
    update: {},
    create: { code: "CASH-01", name: "現金", balance: 0 },
  });
  await prisma.bankAccount.upsert({
    where: { code: "BANK-01" },
    update: {},
    create: { code: "BANK-01", name: "公司銀行帳戶", bankName: "台灣銀行", accountNumber: "000-000-000000" },
  });

  console.log("✅ Seed 完成。請使用 admin / 000000 登入。");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
