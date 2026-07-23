import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { assertTestDatabase } from "./assert-test-database";
import { prisma } from "../src/lib/prisma";

assertTestDatabase(/(^|[_-])(test|ci)([_-]|$)/i, "電商會員測試");

function sessionHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

async function cleanupTenant(tenantId: string) {
  await prisma.storefrontMemberSession.deleteMany({ where: { tenantId } });
  await prisma.storefrontPayment.deleteMany({ where: { tenantId } });
  await prisma.salesOrder.deleteMany({ where: { tenantId } });
  await prisma.storefrontMember.deleteMany({ where: { tenantId } });
  await prisma.customer.deleteMany({ where: { tenantId } });
  await prisma.companySetting.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
}

async function createMember(input: {
  tenantId: string;
  code: string;
  email: string;
  name: string;
  phone: string;
  password: string;
}) {
  const passwordHash = await bcrypt.hash(input.password, 12);
  return prisma.$transaction(async (tx) => {
    const customer = await tx.customer.create({
      data: {
        tenantId: input.tenantId,
        code: input.code,
        companyName: input.name,
        contactName: input.name,
        phone: input.phone,
        email: input.email,
        remark: "由品牌官網會員註冊建立",
      },
    });
    return tx.storefrontMember.create({
      data: {
        tenantId: input.tenantId,
        customerId: customer.id,
        email: input.email,
        passwordHash,
        name: input.name,
        phone: input.phone,
      },
      include: { customer: true },
    });
  });
}

async function main() {
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const slugA = `member-a-${unique}`.toLowerCase();
  const slugB = `member-b-${unique}`.toLowerCase();
  const email = `member-${unique}@example.test`;
  const passwordA = "MemberA1234";
  const passwordB = "MemberB5678";
  const tenantIds: string[] = [];
  const step = (label: string) => console.log(`[storefront-members] ${label}`);

  try {
    step("creating isolated tenants");
    for (const [slug, name] of [[slugA, "會員測試商城 A"], [slugB, "會員測試商城 B"]] as const) {
      const tenant = await prisma.tenant.create({
        data: {
          name,
          businessMode: "ECOMMERCE",
          companyCode: slug.toUpperCase(),
          companySettings: {
            create: { name, storeName: name, storeSlug: slug },
          },
        },
        select: { id: true },
      });
      tenantIds.push(tenant.id);
    }

    step("checking password hash and ERP customer linkage");
    const memberA = await createMember({
      tenantId: tenantIds[0],
      code: `WEB-A-${unique}`,
      email,
      name: "商城會員 A",
      phone: "0912-345-678",
      password: passwordA,
    });
    assert.notEqual(memberA.passwordHash, passwordA);
    assert.equal(await bcrypt.compare(passwordA, memberA.passwordHash), true);
    assert.equal(memberA.customer.tenantId, tenantIds[0]);
    assert.equal(memberA.customer.email, email);

    step("checking hashed session and tenant isolation");
    const tokenA = randomBytes(32).toString("base64url");
    await prisma.storefrontMemberSession.create({
      data: {
        tenantId: tenantIds[0],
        memberId: memberA.id,
        tokenHash: sessionHash(tokenA),
        expiresAt: new Date(Date.now() + 30 * 86_400_000),
      },
    });
    assert.equal(
      await prisma.storefrontMemberSession.count({
        where: { tenantId: tenantIds[0], tokenHash: sessionHash(tokenA) },
      }),
      1,
    );
    assert.equal(
      await prisma.storefrontMemberSession.count({
        where: { tenantId: tenantIds[1], tokenHash: sessionHash(tokenA) },
      }),
      0,
      "tenant A session must not authenticate tenant B",
    );

    step("checking loyalty and ERP order projection");
    await prisma.customer.update({
      where: { id: memberA.customerId },
      data: { loyaltyPoints: 880, loyaltyTier: "GOLD" },
    });
    await prisma.salesOrder.create({
      data: {
        tenantId: tenantIds[0],
        customerId: memberA.customerId,
        number: `WEB-${unique}`,
        subtotal: 1280,
        total: 1280,
        status: "SUBMITTED",
        remark: "電商會員整合測試",
        storefrontPayment: {
          create: {
            tenantId: tenantIds[0],
            method: "TRANSFER",
            status: "AWAITING_TRANSFER",
            amount: 1280,
          },
        },
      },
    });
    const projection = await prisma.storefrontMember.findUnique({
      where: { tenantId_email: { tenantId: tenantIds[0], email } },
      include: {
        customer: {
          include: {
            salesOrders: {
              include: { storefrontPayment: true },
            },
          },
        },
      },
    });
    assert.equal(projection?.customer.loyaltyPoints, 880);
    assert.equal(projection?.customer.loyaltyTier, "GOLD");
    assert.equal(projection?.customer.salesOrders[0].number, `WEB-${unique}`);
    assert.equal(projection?.customer.salesOrders[0].storefrontPayment?.status, "AWAITING_TRANSFER");

    step("checking profile edit synchronizes ERP customer");
    await prisma.$transaction([
      prisma.storefrontMember.update({
        where: { id: memberA.id },
        data: { name: "商城會員 A 已更新", phone: "0933-111-222" },
      }),
      prisma.customer.update({
        where: { id: memberA.customerId },
        data: {
          companyName: "商城會員 A 已更新",
          contactName: "商城會員 A 已更新",
          phone: "0933-111-222",
        },
      }),
    ]);
    const updatedA = await prisma.storefrontMember.findUnique({
      where: { tenantId_email: { tenantId: tenantIds[0], email } },
      include: { customer: true },
    });
    assert.equal(updatedA?.phone, "0933-111-222");
    assert.equal(updatedA?.customer.contactName, "商城會員 A 已更新");

    step("checking same email is allowed only across different tenants");
    const memberB = await createMember({
      tenantId: tenantIds[1],
      code: `WEB-B-${unique}`,
      email,
      name: "商城會員 B",
      phone: "0988-765-432",
      password: passwordB,
    });
    assert.equal(await bcrypt.compare(passwordB, memberB.passwordHash), true);
    assert.equal(await bcrypt.compare(passwordA, memberB.passwordHash), false);
    assert.equal(await prisma.storefrontMember.count({ where: { tenantId: tenantIds[0], email } }), 1);
    assert.equal(await prisma.storefrontMember.count({ where: { tenantId: tenantIds[1], email } }), 1);

    step("checking password replacement and session revocation");
    const passwordA2 = "MemberA9999";
    const passwordHashA2 = await bcrypt.hash(passwordA2, 12);
    await prisma.$transaction([
      prisma.storefrontMember.update({
        where: { id: memberA.id },
        data: { passwordHash: passwordHashA2 },
      }),
      prisma.storefrontMemberSession.deleteMany({
        where: { tenantId: tenantIds[0], memberId: memberA.id },
      }),
    ]);
    assert.equal(await bcrypt.compare(passwordA, passwordHashA2), false);
    assert.equal(await bcrypt.compare(passwordA2, passwordHashA2), true);
    assert.equal(await prisma.storefrontMemberSession.count({ where: { memberId: memberA.id } }), 0);

    step("checking member deletion preserves anonymized accounting customer");
    await prisma.$transaction(async (tx) => {
      await tx.storefrontMember.delete({ where: { id: memberB.id } });
      await tx.customer.update({
        where: { id: memberB.customerId },
        data: {
          companyName: "已刪除會員",
          contactName: "已刪除會員",
          phone: null,
          email: null,
          address: null,
          isActive: false,
          remark: "官網會員已依本人要求刪除；歷史交易僅保留法定帳務關聯",
        },
      });
    });
    assert.equal(await prisma.storefrontMember.count({ where: { tenantId: tenantIds[1], email } }), 0);
    const anonymized = await prisma.customer.findUnique({ where: { id: memberB.customerId } });
    assert.equal(anonymized?.isActive, false);
    assert.equal(anonymized?.email, null);
    assert.equal(anonymized?.contactName, "已刪除會員");

    console.log("Storefront member data isolation / login security / ERP linkage / deletion retention: PASS");
  } finally {
    step("cleaning isolated tenants");
    for (const tenantId of tenantIds.reverse()) {
      await cleanupTenant(tenantId);
    }
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
