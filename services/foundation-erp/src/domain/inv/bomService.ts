/**
 * BOM Service - Bill of Materials aggregate
 * Handles BOM header and component management for project costing
 */

import { db, transaction } from "../../db/connection";
import { appendEvent, EventActor } from "../../events/eventStore";
import { HttpError } from "../../utils/errors";
import { newId } from "../../utils/id";

function now(): string {
  return new Date().toISOString();
}

interface BOMHeaderRow {
  bom_id: string;
  sku_id: string;
  organization_id: string;
  revision: string;
  description: string | null;
  status: "Draft" | "Active" | "Inactive";
  project_eligible: boolean;
  costing_profile: string;
  created_by: string;
  created_at: string;
  effective_date: string | null;
  end_date: string | null;
  version: number;
}

export interface BOMHeaderProjection {
  bomId: string;
  skuId: string;
  organizationId: string;
  revision: string;
  description?: string;
  status: "Draft" | "Active" | "Inactive";
  projectEligible: boolean;
  costingProfile: string;
  createdBy: string;
  createdAt: string;
  effectiveDate?: string;
  endDate?: string;
  version: number;
}

export function createBOMHeader(
  input: {
    skuId: string;
    organizationId: string;
    revision: string;
    description?: string;
    projectEligible?: boolean;
    costingProfile?: string;
    effectiveDate?: string;
    endDate?: string;
  },
  actor?: EventActor
): BOMHeaderProjection {
  const bomId = newId("BOM-");
  const timestamp = now();

  try {
    transaction(() => {
      db.prepare(
        `INSERT INTO inv_bom_header(
          bom_id, sku_id, organization_id, revision, description,
          status, project_eligible, costing_profile,
          created_by, created_at, effective_date, end_date, version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        bomId,
        input.skuId,
        input.organizationId,
        input.revision,
        input.description ?? null,
        "Draft",
        input.projectEligible ? 1 : 0,
        input.costingProfile ?? "Standard",
        actor?.id ?? "system",
        timestamp,
        input.effectiveDate ?? null,
        input.endDate ?? null,
        1
      );

      appendEvent({
        entityId: bomId,
        entityType: "bom_header",
        eventType: "inv.bom_created",
        version: 1,
        actor,
        payload: {
          bomId,
          skuId: input.skuId,
          organizationId: input.organizationId,
          revision: input.revision,
          projectEligible: input.projectEligible ?? false,
        } as unknown as Record<string, unknown>,
      });
    });
  } catch (err: unknown) {
    const sqlError = err as { code?: string };
    if (sqlError.code === "SQLITE_CONSTRAINT_UNIQUE") {
      throw new HttpError(409, "duplicate", "BOM already exists for this SKU/revision");
    }
    throw err;
  }

  return getBOMHeaderById(bomId) as BOMHeaderProjection;
}

export function activateBOMHeader(bomId: string, actor?: EventActor): BOMHeaderProjection {
  const bom = getBOMHeaderById(bomId);
  if (!bom) {
    throw new HttpError(404, "not_found", "BOM not found");
  }
  if (bom.status !== "Draft") {
    throw new HttpError(400, "invalid_state", "BOM must be in Draft status to activate");
  }

  const timestamp = now();
  transaction(() => {
    db.prepare("UPDATE inv_bom_header SET status = ?, version = version + 1 WHERE bom_id = ?").run(
      "Active",
      bomId
    );

    appendEvent({
      entityId: bomId,
      entityType: "bom_header",
      eventType: "inv.bom_activated",
      version: bom.version + 1,
      actor,
      payload: {
        bomId,
        activatedAt: timestamp,
      } as unknown as Record<string, unknown>,
    });
  });

  return getBOMHeaderById(bomId) as BOMHeaderProjection;
}

export function getBOMHeaderById(bomId: string): BOMHeaderProjection | null {
  const row = db
    .prepare("SELECT * FROM inv_bom_header WHERE bom_id = ?")
    .get(bomId) as BOMHeaderRow | undefined;

  if (!row) {
    return null;
  }

  return {
    bomId: row.bom_id,
    skuId: row.sku_id,
    organizationId: row.organization_id,
    revision: row.revision,
    description: row.description ?? undefined,
    status: row.status,
    projectEligible: !!row.project_eligible,
    costingProfile: row.costing_profile,
    createdBy: row.created_by,
    createdAt: row.created_at,
    effectiveDate: row.effective_date ?? undefined,
    endDate: row.end_date ?? undefined,
    version: row.version,
  };
}

export function listBOMHeaders(organizationId: string, limit = 100, offset = 0) {
  const rows = db
    .prepare("SELECT * FROM inv_bom_header WHERE organization_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?")
    .all(organizationId, limit, offset) as BOMHeaderRow[];

  return rows.map((row) => ({
    bomId: row.bom_id,
    skuId: row.sku_id,
    organizationId: row.organization_id,
    revision: row.revision,
    description: row.description ?? undefined,
    status: row.status,
    projectEligible: !!row.project_eligible,
    costingProfile: row.costing_profile,
    createdBy: row.created_by,
    createdAt: row.created_at,
    effectiveDate: row.effective_date ?? undefined,
    endDate: row.end_date ?? undefined,
    version: row.version,
  }));
}
