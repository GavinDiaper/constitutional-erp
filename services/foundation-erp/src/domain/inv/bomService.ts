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

interface BOMComponentRow {
  component_id: string;
  bom_id: string;
  component_sku_id: string | null;
  component_line_number: number;
  component_description: string | null;
  component_type: "Material" | "LaborCostElement" | "OtherCostElement";
  quantity: number;
  quantity_uom: string;
  scrap_percentage: number;
  is_phantom: boolean;
  standard_cost: number;
  cost_element_id: string | null;
  created_by: string;
  created_at: string;
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

export interface BOMComponentProjection {
  componentId: string;
  bomId: string;
  componentSkuId?: string;
  componentLineNumber: number;
  componentDescription?: string;
  componentType: "Material" | "LaborCostElement" | "OtherCostElement";
  quantity: number;
  quantityUom: string;
  scrapPercentage: number;
  isPhantom: boolean;
  standardCost: number;
  costElementId?: string;
  createdBy: string;
  createdAt: string;
  version: number;
}

function mapBOMComponentRow(row: BOMComponentRow): BOMComponentProjection {
  return {
    componentId: row.component_id,
    bomId: row.bom_id,
    componentSkuId: row.component_sku_id ?? undefined,
    componentLineNumber: row.component_line_number,
    componentDescription: row.component_description ?? undefined,
    componentType: row.component_type,
    quantity: row.quantity,
    quantityUom: row.quantity_uom,
    scrapPercentage: row.scrap_percentage,
    isPhantom: !!row.is_phantom,
    standardCost: row.standard_cost,
    costElementId: row.cost_element_id ?? undefined,
    createdBy: row.created_by,
    createdAt: row.created_at,
    version: row.version,
  };
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

export function addBOMComponent(
  input: {
    bomId: string;
    componentSkuId: string;
    componentLineNumber?: number;
    componentDescription?: string;
    quantity: number;
    quantityUom: string;
    scrapPercentage?: number;
    isPhantom?: boolean;
    standardCost?: number;
    costElementId?: string;
  },
  actor?: EventActor
): BOMComponentProjection {
  const bom = getBOMHeaderById(input.bomId);
  if (!bom) {
    throw new HttpError(404, "not_found", "BOM not found");
  }

  if (bom.status !== "Draft") {
    throw new HttpError(400, "invalid_state", "BOM components can only be edited while BOM is Draft");
  }

  const componentId = newId("BOMC-");
  const timestamp = now();
  const nextLineNumberRow = db
    .prepare("SELECT COALESCE(MAX(component_line_number), 0) AS max_line FROM inv_bom_component WHERE bom_id = ?")
    .get(input.bomId) as { max_line: number };
  const lineNumber = input.componentLineNumber ?? nextLineNumberRow.max_line + 10;

  transaction(() => {
    db.prepare(
      `INSERT INTO inv_bom_component(
        component_id, bom_id, component_sku_id, component_line_number,
        component_description, component_type, quantity, quantity_uom,
        scrap_percentage, is_phantom, standard_cost, cost_element_id,
        created_by, created_at, version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      componentId,
      input.bomId,
      input.componentSkuId,
      lineNumber,
      input.componentDescription ?? null,
      "Material",
      input.quantity,
      input.quantityUom,
      input.scrapPercentage ?? 0,
      input.isPhantom ? 1 : 0,
      input.standardCost ?? 0,
      input.costElementId ?? null,
      actor?.id ?? "system",
      timestamp,
      1
    );

    appendEvent({
      entityId: componentId,
      entityType: "bom_component",
      eventType: "inv.bom_component_added",
      version: 1,
      actor,
      payload: {
        componentId,
        bomId: input.bomId,
        componentSkuId: input.componentSkuId,
        componentLineNumber: lineNumber,
        quantity: input.quantity,
      } as unknown as Record<string, unknown>,
    });
  });

  const row = db
    .prepare("SELECT * FROM inv_bom_component WHERE component_id = ?")
    .get(componentId) as BOMComponentRow;
  return mapBOMComponentRow(row);
}

export function listBOMComponents(bomId: string): BOMComponentProjection[] {
  const rows = db
    .prepare("SELECT * FROM inv_bom_component WHERE bom_id = ? ORDER BY component_line_number ASC")
    .all(bomId) as BOMComponentRow[];
  return rows.map(mapBOMComponentRow);
}
