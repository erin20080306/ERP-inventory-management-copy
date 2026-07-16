import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { POST } from "../src/app/api/contact/route";
import { prisma } from "../src/lib/prisma";

const email = `contact-flow-${Date.now()}@example.invalid`;
const previousPassword = process.env.GMAIL_APP_PASSWORD;

async function main() {
  delete process.env.GMAIL_APP_PASSWORD;
  const response = await POST(new NextRequest("http://localhost/api/contact", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-real-ip": "127.0.0.201" },
    body: JSON.stringify({
      name: "方案測試員",
      email,
      company: "方案流程測試公司",
      lineId: "",
      businessMode: "POS_RETAIL",
      plan: "TEAM_2",
      billing: "MONTHLY",
      notes: "驗證信件未設定時仍會保存後台需求",
      consent: true,
      website: "",
    }),
  }));
  assert.equal(response.status, 202);
  const result = await response.json();
  assert.equal(result.ok, true);
  assert.ok(result.inquiryId);
  const row = await prisma.planInquiry.findUnique({ where: { id: result.inquiryId } });
  assert.equal(row?.email, email);
  assert.equal(row?.notificationStatus, "NOT_CONFIGURED");
  assert.equal(row?.status, "NEW");
  await prisma.planInquiry.delete({ where: { id: result.inquiryId } });
  console.log("Commercial inquiry persistence without email delivery: PASS");
}

main().finally(async () => {
  if (previousPassword === undefined) delete process.env.GMAIL_APP_PASSWORD;
  else process.env.GMAIL_APP_PASSWORD = previousPassword;
  await prisma.$disconnect();
});
