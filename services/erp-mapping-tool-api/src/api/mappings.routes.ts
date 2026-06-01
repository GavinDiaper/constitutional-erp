import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { db } from "../db/connection";
import { HttpError } from "../utils/errors";

const mappingStatusSchema = z.enum(["MAPPED", "PARTIAL", "NOT_APPLICABLE", "GAP"]);

const createFieldMappingSchema = z.object({
  fieldId: z.string().min(1),
  systemId: z.string().min(1),
  erpModule: z.string().trim().optional().nullable(),
  erpTable: z.string().trim().optional().nullable(),
  erpField: z.string().trim().optional().nullable(),
  erpFullReference: z.string().trim().optional().nullable(),
  mappingStatus: mappingStatusSchema.default("MAPPED"),
  transformationNotes: z.string().trim().optional().nullable(),
  isBidirectional: z.boolean().optional().default(true)
});

const updateFieldMappingSchema = z.object({
  erpModule: z.string().trim().optional().nullable(),
  erpTable: z.string().trim().optional().nullable(),
  erpField: z.string().trim().optional().nullable(),
  erpFullReference: z.string().trim().optional().nullable(),
  mappingStatus: mappingStatusSchema.optional(),
  transformationNotes: z.string().trim().optional().nullable(),
  isBidirectional: z.boolean().optional()
});

function coerceNullable(value: string | null | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  return value.trim() ? value.trim() : null;
}

function hasField(table: string, key: string, value: string): boolean {
  const row = db.prepare(`SELECT 1 as exists_flag FROM ${table} WHERE ${key} = ? LIMIT 1`).get(value);
  return Boolean(row);
}

export const mappingsRouter = Router();

mappingsRouter.post("/mappings", (req, res) => {
  const payload = createFieldMappingSchema.parse(req.body);

  if (!hasField("erp_canonical_field", "field_id", payload.fieldId)) {
    throw new HttpError(404, "not_found", `Unknown canonical field '${payload.fieldId}'`);
  }

  if (!hasField("erp_system", "system_id", payload.systemId)) {
    throw new HttpError(404, "not_found", `Unknown system '${payload.systemId}'`);
  }

  const existing = db
    .prepare("SELECT id FROM erp_field_mapping WHERE field_id = ? AND system_id = ? LIMIT 1")
    .get(payload.fieldId, payload.systemId) as { id: string } | undefined;

  if (existing) {
    throw new HttpError(
      409,
      "conflict",
      `A mapping for field '${payload.fieldId}' and system '${payload.systemId}' already exists as '${existing.id}'`
    );
  }

  const now = new Date().toISOString();
  const id = `FM-${payload.systemId}-${randomUUID()}`;

  db.prepare(
    `INSERT INTO erp_field_mapping (
      id, field_id, system_id, erp_module, erp_table, erp_field, erp_full_reference,
      mapping_status, transformation_notes, is_bidirectional, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    payload.fieldId,
    payload.systemId,
    coerceNullable(payload.erpModule),
    coerceNullable(payload.erpTable),
    coerceNullable(payload.erpField),
    coerceNullable(payload.erpFullReference),
    payload.mappingStatus,
    coerceNullable(payload.transformationNotes),
    payload.isBidirectional ? 1 : 0,
    now,
    now
  );

  const created = db.prepare("SELECT * FROM erp_field_mapping WHERE id = ?").get(id);

  res.status(201).json({ data: created });
});

mappingsRouter.put("/mappings/:id", (req, res) => {
  const payload = updateFieldMappingSchema.parse(req.body);
  const mappingId = req.params.id;

  const existing = db.prepare("SELECT * FROM erp_field_mapping WHERE id = ?").get(mappingId) as
    | Record<string, unknown>
    | undefined;

  if (!existing) {
    throw new HttpError(404, "not_found", `No mapping found for id '${mappingId}'`);
  }

  const now = new Date().toISOString();
  const erpModule = payload.erpModule !== undefined ? coerceNullable(payload.erpModule) : (existing.erp_module as string | null);
  const erpTable = payload.erpTable !== undefined ? coerceNullable(payload.erpTable) : (existing.erp_table as string | null);
  const erpField = payload.erpField !== undefined ? coerceNullable(payload.erpField) : (existing.erp_field as string | null);
  const erpFullReference =
    payload.erpFullReference !== undefined
      ? coerceNullable(payload.erpFullReference)
      : (existing.erp_full_reference as string | null);
  const mappingStatus = payload.mappingStatus ?? (existing.mapping_status as string);
  const transformationNotes =
    payload.transformationNotes !== undefined
      ? coerceNullable(payload.transformationNotes)
      : (existing.transformation_notes as string | null);
  const isBidirectional =
    payload.isBidirectional !== undefined
      ? payload.isBidirectional
      : Number(existing.is_bidirectional) === 1;

  db.prepare(
    `UPDATE erp_field_mapping
     SET erp_module = ?,
         erp_table = ?,
         erp_field = ?,
         erp_full_reference = ?,
         mapping_status = ?,
         transformation_notes = ?,
         is_bidirectional = ?,
         updated_at = ?
     WHERE id = ?`
  ).run(
    erpModule,
    erpTable,
    erpField,
    erpFullReference,
    mappingStatus,
    transformationNotes,
    isBidirectional ? 1 : 0,
    now,
    mappingId
  );

  const updated = db.prepare("SELECT * FROM erp_field_mapping WHERE id = ?").get(mappingId);
  res.json({ data: updated });
});
