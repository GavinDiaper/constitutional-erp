/**
 * Cost Element Service - R2R/GL routing aggregate
 * Manages cost element master data and GL account mappings
 */

import { db, transaction } from "../../db/connection";
import { appendEvent, EventActor } from "../../events/eventStore";
import { HttpError } from "../../utils/errors";
import { newId } from "../../utils/id";

function now(): string {
  return new Date().toISOString();
}

interface CostElementRow {
  cost_element_id: string;
  organization_id: string;
  cost_element_name: string;
  cost_element_type: "Material" | "Labor" | "Overhead" | "Other";
  cost_category: string;
  gl_account_id: string;
  tax_code_id: string | null;
  allocation_method: "Direct" | "Allocation" | "Rounding";
  is_active: boolean;
  created_by: string;
  created_at: string;
  version: number;
}

export interface CostElementProjection {
  costElementId: string;
  organizationId: string;
  costElementName: string;
  costElementType: "Material" | "Labor" | "Overhead" | "Other";
  costCategory: string;
  glAccountId: string;
  taxCodeId?: string;
  allocationMethod: "Direct" | "Allocation" | "Rounding";
  isActive: boolean;
  createdBy: string;
  createdAt: string;
  version: number;
}

export function createCostElement(
  input: {
    organizationId: string;
    costElementName: string;
    costElementType: "Material" | "Labor" | "Overhead" | "Other";
    costCategory?: string;
    glAccountId: string;
    taxCodeId?: string;
    allocationMethod?: "Direct" | "Allocation" | "Rounding";
  },
  actor?: EventActor
): CostElementProjection {
  const costElementId = newId("CE-");
  const timestamp = now();

  // Verify GL account exists (optional guard)
  const glAccount = db
    .prepare("SELECT account_id FROM r2r_account WHERE account_id = ?")
    .get(input.glAccountId) as { account_id: string } | undefined;

  if (!glAccount) {
    throw new HttpError(404, "not_found", "GL account not found");
  }

  try {
    transaction(() => {
      db.prepare(
        `INSERT INTO r2r_cost_element(
          cost_element_id, organization_id, cost_element_name, cost_element_type,
          cost_category, gl_account_id, tax_code_id, allocation_method,
          is_active, created_by, created_at, version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        costElementId,
        input.organizationId,
        input.costElementName,
        input.costElementType,
        input.costCategory ?? "Standard",
        input.glAccountId,
        input.taxCodeId ?? null,
        input.allocationMethod ?? "Direct",
        1,
        actor?.id ?? "system",
        timestamp,
        1
      );

      appendEvent({
        entityId: costElementId,
        entityType: "cost_element",
        eventType: "r2r.cost_element_created",
        version: 1,
        actor,
        payload: {
          costElementId,
          organizationId: input.organizationId,
          costElementName: input.costElementName,
          costElementType: input.costElementType,
          glAccountId: input.glAccountId,
        } as unknown as Record<string, unknown>,
      });
    });
  } catch (err: unknown) {
    const sqlError = err as { code?: string };
    if (sqlError.code === "SQLITE_CONSTRAINT_UNIQUE") {
      throw new HttpError(409, "duplicate", "Cost element already exists for this organization");
    }
    throw err;
  }

  return getCostElementById(costElementId) as CostElementProjection;
}

export function getCostElementById(costElementId: string): CostElementProjection | null {
  const row = db
    .prepare("SELECT * FROM r2r_cost_element WHERE cost_element_id = ?")
    .get(costElementId) as CostElementRow | undefined;

  if (!row) {
    return null;
  }

  return {
    costElementId: row.cost_element_id,
    organizationId: row.organization_id,
    costElementName: row.cost_element_name,
    costElementType: row.cost_element_type,
    costCategory: row.cost_category,
    glAccountId: row.gl_account_id,
    taxCodeId: row.tax_code_id ?? undefined,
    allocationMethod: row.allocation_method,
    isActive: row.is_active,
    createdBy: row.created_by,
    createdAt: row.created_at,
    version: row.version,
  };
}

export function listCostElements(organizationId: string, limit = 100, offset = 0) {
  const rows = db
    .prepare(
      "SELECT * FROM r2r_cost_element WHERE organization_id = ? AND is_active = 1 ORDER BY created_at DESC LIMIT ? OFFSET ?"
    )
    .all(organizationId, limit, offset) as CostElementRow[];

  return rows.map((row) => ({
    costElementId: row.cost_element_id,
    organizationId: row.organization_id,
    costElementName: row.cost_element_name,
    costElementType: row.cost_element_type,
    costCategory: row.cost_category,
    glAccountId: row.gl_account_id,
    taxCodeId: row.tax_code_id ?? undefined,
    allocationMethod: row.allocation_method,
    isActive: row.is_active,
    createdBy: row.created_by,
    createdAt: row.created_at,
    version: row.version,
  }));
}

export function deactivateCostElement(
  costElementId: string,
  actor?: EventActor
): CostElementProjection {
  const costElement = getCostElementById(costElementId);
  if (!costElement) {
    throw new HttpError(404, "not_found", "Cost element not found");
  }

  const timestamp = now();
  transaction(() => {
    db.prepare("UPDATE r2r_cost_element SET is_active = 0, version = version + 1 WHERE cost_element_id = ?").run(
      costElementId
    );

    appendEvent({
      entityId: costElementId,
      entityType: "cost_element",
      eventType: "r2r.cost_element_deactivated",
      version: costElement.version + 1,
      actor,
      payload: {
        costElementId,
        deactivatedAt: timestamp,
      } as unknown as Record<string, unknown>,
    });
  });

  return getCostElementById(costElementId) as CostElementProjection;
}
