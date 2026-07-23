import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { ALL_PERMISSIONS, DEFAULT_ROLES } from "../src/lib/permissions";
import { seedOperationalBaseline } from "../src/lib/seed-operational-baseline";
import { STANDARD_ACCOUNTS } from "./standard-accounts";

const prisma = new PrismaClient();

async function main() {
  const requestedMode = process.env.BUSINESS_MODE === "POS"
    ? "POS_RETAIL"
    : ["ERP", "POS_RETAIL", "POS_RESTAURANT", "ECOMMERCE"].includes(process.env.BUSINESS_MODE || "")
      ? process.env.BUSINESS_MODE!
      : "ERP";
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

  console.log("→ 建立預設租戶 ...");
  let tenant = await prisma.tenant.findFirst({ where: { isInternal: false } });
  if (!tenant) {
    tenant = await prisma.tenant.create({ data: { name: process.env.COMPANY_NAME || "示範公司", businessMode: requestedMode } });
  }
  tenant = await prisma.tenant.update({ where: { id: tenant.id }, data: { businessMode: requestedMode, name: process.env.COMPANY_NAME || tenant.name } });
  const T = tenant.id;

  console.log("→ 建立預設管理員 admin ...");
  const adminUser = process.env.ADMIN_USERNAME || "admin";
  const adminPwd = process.env.ADMIN_PASSWORD;
  if (!adminPwd || adminPwd.length < 8) throw new Error("ADMIN_PASSWORD 必須設定且至少 8 個字元");
  const adminEmail = process.env.ADMIN_EMAIL || "admin@example.com";
  const hash = await bcrypt.hash(adminPwd, 12);

  const admin = await prisma.user.upsert({
    where: { username: adminUser },
    update: { passwordHash: hash, name: "系統管理員", email: adminEmail, isActive: true },
    create: { tenantId: T, username: adminUser, name: "系統管理員", email: adminEmail, passwordHash: hash },
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
  const existing = await prisma.companySetting.findFirst({ where: { tenantId: T } });
  if (!existing) {
    await prisma.companySetting.create({
      data: { tenantId: T, name: "示範公司股份有限公司", taxId: "12345678", currency: "TWD", phone: "02-0000-0000", email: "info@example.com" },
    });
  }

  console.log("→ 編號規則 ...");
  const seqs = ["PO", "SO", "QT", "JE", "RP", "SP", "SR", "PR", "ADJ", "TRF", "INV", "POS", "GR", "DN", "PRF", "DINE", "KOT"];
  for (const k of seqs) {
    const ex = await prisma.numberSequence.findUnique({ where: { tenantId_key: { tenantId: T, key: k } } });
    if (!ex) {
      await prisma.numberSequence.create({ data: { tenantId: T, key: k, prefix: k } });
    }
  }

  console.log("→ 稅率 ...");
  const tax5Ex = await prisma.taxRate.findUnique({ where: { tenantId_code: { tenantId: T, code: "VAT5" } } });
  if (!tax5Ex) {
    await prisma.taxRate.create({ data: { tenantId: T, code: "VAT5", name: "營業稅 5%", rate: 0.05, region: "TW" } });
  }
  const zeroEx = await prisma.taxRate.findUnique({ where: { tenantId_code: { tenantId: T, code: "ZERO" } } });
  if (!zeroEx) {
    await prisma.taxRate.create({ data: { tenantId: T, code: "ZERO", name: "零稅率", rate: 0, region: "TW" } });
  }

  console.log(`→ 標準會計科目 (${STANDARD_ACCOUNTS.length} 條) ...`);
  for (const a of STANDARD_ACCOUNTS) {
    const aEx = await prisma.chartOfAccount.findUnique({ where: { tenantId_code: { tenantId: T, code: a.code } } });
    if (!aEx) {
      await prisma.chartOfAccount.create({ data: { tenantId: T, code: a.code, name: a.name, type: a.type } });
    }
  }

  console.log("→ 倉庫 ...");
  let wh = await prisma.warehouse.findUnique({ where: { tenantId_code: { tenantId: T, code: "WH-MAIN" } } });
  if (!wh) {
    wh = await prisma.warehouse.create({ data: { tenantId: T, code: "WH-MAIN", name: "主倉庫" } });
  }
  await prisma.posRegister.upsert({
    where: { tenantId_code: { tenantId: T, code: "POS01" } },
    update: { warehouseId: wh.id, isActive: true },
    create: { tenantId: T, warehouseId: wh.id, code: "POS01", name: "第一收銀台" },
  });
  if (requestedMode === "POS_RESTAURANT") {
    const area = await prisma.restaurantArea.upsert({
      where: { tenantId_code: { tenantId: T, code: "DINING" } },
      update: { isActive: true },
      create: { tenantId: T, code: "DINING", name: "用餐區", sortOrder: 1 },
    });
    for (let index = 1; index <= 8; index += 1) {
      const code = `T${String(index).padStart(2, "0")}`;
      await prisma.restaurantTable.upsert({
        where: { tenantId_code: { tenantId: T, code } },
        update: { areaId: area.id, isActive: true },
        create: { tenantId: T, areaId: area.id, code, name: `${index} 號桌`, seats: index <= 2 ? 2 : 4, sortOrder: index },
      });
    }
  }

  console.log("→ 建立符合營運模式的範例商品 ...");
  await seedOperationalBaseline(prisma, {
    tenantId: T,
    tenantName: tenant.name,
    businessMode: requestedMode,
    isInternal: tenant.isInternal,
    mainWarehouseId: wh.id,
  });

  console.log("→ 範例客戶 / 供應商 ...");
  const c1 = await prisma.customer.findUnique({ where: { tenantId_code: { tenantId: T, code: "C001" } } });
  if (!c1) {
    await prisma.customer.create({ data: { tenantId: T, code: "C001", companyName: "範例客戶有限公司", taxId: "11111111", contactName: "陳先生", phone: "02-1111-1111", email: "c1@example.com" } });
  }
  const s1 = await prisma.supplier.findUnique({ where: { tenantId_code: { tenantId: T, code: "S001" } } });
  if (!s1) {
    await prisma.supplier.create({ data: { tenantId: T, code: "S001", companyName: "範例供應商有限公司", taxId: "22222222", contactName: "林小姐", phone: "02-2222-2222", email: "s1@example.com" } });
  }

  console.log("→ 現金 / 銀行帳戶 ...");
  const ca = await prisma.cashAccount.findUnique({ where: { tenantId_code: { tenantId: T, code: "CASH-01" } } });
  if (!ca) {
    await prisma.cashAccount.create({ data: { tenantId: T, code: "CASH-01", name: "現金", balance: 0 } });
  }
  const ba = await prisma.bankAccount.findUnique({ where: { tenantId_code: { tenantId: T, code: "BANK-01" } } });
  if (!ba) {
    await prisma.bankAccount.create({ data: { tenantId: T, code: "BANK-01", name: "公司銀行帳戶", bankName: "台灣銀行", accountNumber: "000-000-000000" } });
  }

  console.log(`✅ Seed 完成。請使用 ${adminUser} 與你設定的 ADMIN_PASSWORD 登入。`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
