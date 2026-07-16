import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, apiHandler, audit, requirePermission, requireTenantId } from "@/lib/api";
import { customFieldPermissionModule, isCustomFieldModule } from "@/lib/custom-fields";
import { prisma } from "@/lib/prisma";

const SaveValueInput = z.object({
  module: z.string().min(1),
  rowId: z.string().trim().min(1).max(100),
  columnId: z.string().trim().min(1).max(100),
  value: z.string().max(10_000).nullable(),
});

const SaveValuesInput = z.object({
  module: z.string().min(1),
  values: z.array(z.object({
    rowId: z.string().trim().min(1).max(100),
    columnId: z.string().trim().min(1).max(100),
    value: z.string().max(10_000).nullable(),
  })).min(1).max(2_000),
});

function parseModule(value: string | null) {
  if (!value || !isCustomFieldModule(value)) throw new ApiError(400, "不支援的自訂欄位模組");
  return value;
}

export const GET = apiHandler(async (req: NextRequest) => {
  const module = parseModule(req.nextUrl.searchParams.get("module"));
  const session = await requirePermission(`${customFieldPermissionModule(module)}.view`);
  const tenantId = await requireTenantId(session);
  const rowIds = [...new Set((req.nextUrl.searchParams.get("rowIds") || "").split(",").map((value) => value.trim()).filter(Boolean))];
  if (rowIds.length > 100) throw new ApiError(400, "一次最多讀取 100 筆自訂欄位值");
  if (rowIds.some((rowId) => rowId.length > 100)) throw new ApiError(400, "資料列識別碼格式錯誤");
  if (rowIds.length === 0) return NextResponse.json({ values: {} });

  const rows = await prisma.customFieldValue.findMany({
    where: { tenantId, module, rowId: { in: rowIds }, column: { tenantId, module } },
    select: { rowId: true, columnId: true, value: true, updatedAt: true },
  });
  const values: Record<string, Record<string, string>> = {};
  for (const row of rows) {
    values[row.rowId] ||= {};
    values[row.rowId][row.columnId] = row.value ?? "";
  }
  return NextResponse.json({ values });
});

export const PUT = apiHandler(async (req: NextRequest) => {
  const body = SaveValueInput.parse(await req.json());
  const module = parseModule(body.module);
  const session = await requirePermission(`${customFieldPermissionModule(module)}.edit`);
  const tenantId = await requireTenantId(session);
  const column = await prisma.customColumnDefinition.findFirst({
    where: { id: body.columnId, tenantId, module },
    select: { id: true, label: true },
  });
  if (!column) throw new ApiError(404, "找不到自訂欄位");

  if (body.value === null) {
    await prisma.customFieldValue.deleteMany({
      where: { tenantId, module, rowId: body.rowId, columnId: column.id },
    });
  } else {
    await prisma.customFieldValue.upsert({
      where: { tenantId_module_rowId_columnId: { tenantId, module, rowId: body.rowId, columnId: column.id } },
      update: { value: body.value, updatedBy: session.user.name || session.user.username },
      create: { tenantId, module, rowId: body.rowId, columnId: column.id, value: body.value, updatedBy: session.user.name || session.user.username },
    });
  }

  await audit({
    userId: session.user.id,
    action: "update_custom_field",
    module,
    refId: body.rowId,
    detail: `${column.label}=${body.value ?? "(清除)"}`.slice(0, 500),
  });
  return NextResponse.json({ ok: true, value: body.value });
});

/** Excel 多格貼上使用單一批次請求，避免每一格各等一次網路。 */
export const PATCH = apiHandler(async (req: NextRequest) => {
  const body = SaveValuesInput.parse(await req.json());
  const module = parseModule(body.module);
  const session = await requirePermission(`${customFieldPermissionModule(module)}.edit`);
  const tenantId = await requireTenantId(session);
  const columnIds = [...new Set(body.values.map((item) => item.columnId))];
  const columns = await prisma.customColumnDefinition.findMany({
    where: { id: { in: columnIds }, tenantId, module },
    select: { id: true, label: true },
  });
  if (columns.length !== columnIds.length) throw new ApiError(404, "部分自訂欄位不存在或不屬於目前公司");

  const deduped = new Map<string, (typeof body.values)[number]>();
  for (const item of body.values) deduped.set(`${item.rowId}\u0000${item.columnId}`, item);
  const changes = [...deduped.values()];
  await prisma.$transaction(async (tx) => {
    for (const item of changes) {
      if (item.value === null) {
        await tx.customFieldValue.deleteMany({
          where: { tenantId, module, rowId: item.rowId, columnId: item.columnId },
        });
      } else {
        await tx.customFieldValue.upsert({
          where: { tenantId_module_rowId_columnId: { tenantId, module, rowId: item.rowId, columnId: item.columnId } },
          update: { value: item.value, updatedBy: session.user.name || session.user.username },
          create: { tenantId, module, rowId: item.rowId, columnId: item.columnId, value: item.value, updatedBy: session.user.name || session.user.username },
        });
      }
    }
  }, { timeout: 30_000 });

  const labels = new Map(columns.map((column) => [column.id, column.label]));
  await audit({
    userId: session.user.id,
    action: "paste_custom_field_grid",
    module,
    detail: `批次更新 ${changes.length} 格；欄位：${[...new Set(changes.map((item) => labels.get(item.columnId)))].filter(Boolean).join("、")}`.slice(0, 500),
  });
  return NextResponse.json({ ok: true, count: changes.length });
});
