import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, apiHandler, audit, requirePermission, requireTenantId } from "@/lib/api";
import { customFieldPermissionModule, isCustomFieldModule } from "@/lib/custom-fields";
import { prisma } from "@/lib/prisma";

const ColumnInput = z.object({
  id: z.string().min(1).max(100).optional(),
  label: z.string().trim().min(1).max(60),
  type: z.enum(["text", "number", "date"]),
});

const SaveInput = z.object({
  module: z.string().min(1),
  columns: z.array(ColumnInput).max(30),
});

function parseModule(value: string | null) {
  if (!value || !isCustomFieldModule(value)) throw new ApiError(400, "不支援的自訂欄位模組");
  return value;
}

export const GET = apiHandler(async (req: NextRequest) => {
  const module = parseModule(req.nextUrl.searchParams.get("module"));
  const session = await requirePermission(`${customFieldPermissionModule(module)}.view`);
  const tenantId = await requireTenantId(session);
  const columns = await prisma.customColumnDefinition.findMany({
    where: { tenantId, module },
    select: { id: true, label: true, type: true, sortOrder: true, updatedAt: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return NextResponse.json({ columns });
});

export const PUT = apiHandler(async (req: NextRequest) => {
  const body = SaveInput.parse(await req.json());
  const module = parseModule(body.module);
  const session = await requirePermission(`${customFieldPermissionModule(module)}.manage`);
  const tenantId = await requireTenantId(session);
  const normalizedLabels = body.columns.map((column) => column.label.trim().toLocaleLowerCase("zh-TW"));
  if (new Set(normalizedLabels).size !== normalizedLabels.length) throw new ApiError(409, "自訂欄位名稱不可重複");

  const columns = await prisma.$transaction(async (tx) => {
    const existing = await tx.customColumnDefinition.findMany({ where: { tenantId, module } });
    const existingById = new Map(existing.map((column) => [column.id, column]));
    const keptIds = body.columns.flatMap((column) => column.id && existingById.has(column.id) ? [column.id] : []);
    await tx.customColumnDefinition.deleteMany({ where: { tenantId, module, id: { notIn: keptIds } } });

    for (const column of body.columns) {
      if (column.id && existingById.has(column.id)) {
        await tx.customColumnDefinition.update({
          where: { id: column.id },
          data: { label: `__tmp__${column.id}`, type: column.type },
        });
      }
    }

    for (const [sortOrder, column] of body.columns.entries()) {
      if (column.id && existingById.has(column.id)) {
        await tx.customColumnDefinition.update({
          where: { id: column.id },
          data: { label: column.label.trim(), type: column.type, sortOrder },
        });
      } else {
        await tx.customColumnDefinition.create({
          data: { tenantId, module, label: column.label.trim(), type: column.type, sortOrder },
        });
      }
    }

    return tx.customColumnDefinition.findMany({
      where: { tenantId, module },
      select: { id: true, label: true, type: true, sortOrder: true, updatedAt: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
  });

  await audit({
    userId: session.user.id,
    action: "configure_custom_fields",
    module,
    detail: columns.map((column) => column.label).join("、") || "清除全部自訂欄位",
  });
  return NextResponse.json({ columns });
});
