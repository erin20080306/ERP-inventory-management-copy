import { NextRequest, NextResponse } from "next/server";
import { apiHandler, requirePermission, requireTenantId } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import XLSX from "xlsx";

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission("payroll.export");
  const id = req.nextUrl.pathname.split("/").slice(-2, -1)[0];
  const tenantId = await requireTenantId();

  const payroll = await prisma.payroll.findUnique({
    where: { id },
    include: {
      employee: { include: { department: true } },
      period: true,
      items: true,
    },
  });

  if (!payroll) {
    throw new Error("找不到薪資單");
  }

  // 準備 Excel 資料
  const wb = XLSX.utils.book_new();

  // 基本資訊
  const basicInfo = [
    { 項目: "薪資單號", 值: payroll.number },
    { 項目: "員工編號", 值: payroll.employee.employeeNo },
    { 項目: "員工姓名", 值: payroll.employee.name },
    { 項目: "部門", 值: payroll.employee.department?.name || "未分類" },
    { 項目: "職稱", 值: payroll.employee.position || "未設定" },
    { 項目: "結算期間", 值: `${payroll.period.year}年${payroll.period.month}月` },
    { 項目: "工作天數", 值: Number(payroll.workDays) },
    { 項目: "加班時數", 值: Number(payroll.overtimeHours) },
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(basicInfo), "基本資訊");

  // 應發項目
  const earnings = payroll.items.filter((item) => item.type === "EARNING").map((item) => ({
    項目: item.name,
    金額: Number(item.amount),
    是否計稅: item.taxable ? "是" : "否",
    備註: item.remark || "",
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(earnings), "應發項目");

  // 應扣項目
  const deductions = payroll.items.filter((item) => item.type === "DEDUCTION").map((item) => ({
    項目: item.name,
    金額: Number(item.amount),
    備註: item.remark || "",
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(deductions), "應扣項目");

  // 雇主負擔
  const employerCosts = payroll.items.filter((item) => item.type === "EMPLOYER").map((item) => ({
    項目: item.name,
    金額: Number(item.amount),
    備註: item.remark || "",
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(employerCosts), "雇主負擔");

  // 總計
  const summary = [
    { 項目: "應發小計", 金額: Number(payroll.earnings) },
    { 項目: "應扣小計", 金額: Number(payroll.deductions) },
    { 項目: "雇主負擔", 金額: Number(payroll.employerCost) },
    { 項目: "淨額", 金額: Number(payroll.netPay) },
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), "總計");

  // 生成 Excel 檔案
  const buffer = XLSX.write(wb, { bookType: "xlsx", type: "buffer" }) as Buffer;
  const uint8Array = new Uint8Array(buffer);

  // 設定回應標頭
  const filename = `薪資單_${payroll.employee.name}_${payroll.period.year}${String(payroll.period.month).padStart(2, "0")}.xlsx`;
  return new NextResponse(uint8Array, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
    },
  });
});
