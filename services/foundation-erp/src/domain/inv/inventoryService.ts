import { db, transaction } from "../../db/connection";
import { appendEvent, EventActor } from "../../events/eventStore";
import { HttpError } from "../../utils/errors";
import { newId } from "../../utils/id";

type ValuationMethod = "standard" | "moving_average";
type MovementType = "receipt" | "issue" | "adjustment" | "cost_update";

type SkuRow = {
  sku_id: string;
  sku_code: string;
  description: string;
  category: string | null;
  uom: string;
  valuation_method: ValuationMethod;
  standard_cost: number;
  lifecycle_state: string;
  version: number;
};

type OnHandRow = {
  on_hand_id: string;
  sku_id: string;
  organization_id: string;
  quantity_on_hand: number;
  inventory_value: number;
  moving_average_cost: number;
  updated_at: string;
};

function now(): string {
  return new Date().toISOString();
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function parseActorTier(actor?: EventActor): number {
  if (!actor?.authorityTier) {
    return 0;
  }

  const parsed = Number(actor.authorityTier);
  return Number.isFinite(parsed) ? parsed : 0;
}

function requireTier(actor: EventActor | undefined, requiredTier: 1 | 2 | 3 | 4 | 5, message: string): void {
  if (parseActorTier(actor) < requiredTier) {
    throw new HttpError(403, "insufficient_authority", message);
  }
}

function getSkuRow(skuId: string): SkuRow {
  const row = db.prepare("SELECT * FROM inv_sku WHERE sku_id = ?").get(skuId) as SkuRow | undefined;
  if (!row) {
    throw new HttpError(404, "not_found", "Inventory SKU not found");
  }

  return row;
}

function ensureOrganizationExists(organizationId: string): void {
  const row = db
    .prepare("SELECT organization_id FROM inv_organization WHERE organization_id = ?")
    .get(organizationId) as { organization_id: string } | undefined;

  if (!row) {
    throw new HttpError(404, "not_found", "Inventory organization not found");
  }
}

function getOnHandRow(skuId: string, organizationId: string): OnHandRow | undefined {
  return db
    .prepare("SELECT * FROM inv_on_hand WHERE sku_id = ? AND organization_id = ?")
    .get(skuId, organizationId) as OnHandRow | undefined;
}

function upsertOnHand(input: {
  skuId: string;
  organizationId: string;
  quantityOnHand: number;
  inventoryValue: number;
  movingAverageCost: number;
}): void {
  const timestamp = now();
  const existing = getOnHandRow(input.skuId, input.organizationId);

  if (existing) {
    db.prepare(
      `UPDATE inv_on_hand
       SET quantity_on_hand = ?, inventory_value = ?, moving_average_cost = ?, updated_at = ?
       WHERE on_hand_id = ?`
    ).run(
      input.quantityOnHand,
      input.inventoryValue,
      input.movingAverageCost,
      timestamp,
      existing.on_hand_id
    );
    return;
  }

  db.prepare(
    `INSERT INTO inv_on_hand(on_hand_id, sku_id, organization_id, quantity_on_hand, inventory_value, moving_average_cost, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    newId("ONH-"),
    input.skuId,
    input.organizationId,
    input.quantityOnHand,
    input.inventoryValue,
    input.movingAverageCost,
    timestamp
  );
}

function computeUnitCost(input: {
  sku: SkuRow;
  onHand: OnHandRow | undefined;
  movementType: MovementType;
  quantity: number;
  unitCost?: number;
}): number {
  const { sku, onHand, movementType, quantity, unitCost } = input;

  if (movementType === "cost_update") {
    if (!Number.isFinite(unitCost) || Number(unitCost) < 0) {
      throw new HttpError(400, "invalid_request", "cost_update requires a non-negative unitCost");
    }

    return roundMoney(Number(unitCost));
  }

  if (movementType === "receipt") {
    const fallback = sku.valuation_method === "standard" ? sku.standard_cost : onHand?.moving_average_cost ?? 0;
    const resolved = unitCost ?? fallback;
    if (!Number.isFinite(resolved) || resolved < 0) {
      throw new HttpError(400, "invalid_request", "receipt unit cost must be non-negative");
    }

    return roundMoney(resolved);
  }

  if (movementType === "issue") {
    if (sku.valuation_method === "standard") {
      return roundMoney(sku.standard_cost);
    }

    return roundMoney(onHand?.moving_average_cost ?? 0);
  }

  if (movementType === "adjustment") {
    if (quantity > 0) {
      const fallback = sku.valuation_method === "standard" ? sku.standard_cost : onHand?.moving_average_cost ?? 0;
      const resolved = unitCost ?? fallback;
      if (!Number.isFinite(resolved) || resolved < 0) {
        throw new HttpError(400, "invalid_request", "positive adjustment unit cost must be non-negative");
      }
      return roundMoney(resolved);
    }

    if (sku.valuation_method === "standard") {
      return roundMoney(sku.standard_cost);
    }

    return roundMoney(onHand?.moving_average_cost ?? 0);
  }

  return 0;
}

function validateMovementInput(movementType: MovementType, quantity: number): void {
  if (!Number.isFinite(quantity)) {
    throw new HttpError(400, "invalid_request", "quantity must be a valid number");
  }

  if (movementType === "receipt" || movementType === "issue") {
    if (quantity <= 0) {
      throw new HttpError(400, "invalid_request", `${movementType} quantity must be greater than zero`);
    }
  }

  if (movementType === "adjustment" && quantity === 0) {
    throw new HttpError(400, "invalid_request", "adjustment quantity cannot be zero");
  }

  if (movementType === "cost_update" && quantity !== 0) {
    throw new HttpError(400, "invalid_request", "cost_update quantity must be zero");
  }
}

function toSignedQuantity(movementType: MovementType, quantity: number): number {
  if (movementType === "issue") {
    return -quantity;
  }

  return quantity;
}

export function createSku(input: {
  skuCode: string;
  description: string;
  category?: string;
  uom: string;
  valuationMethod: ValuationMethod;
  standardCost?: number;
}, actor?: EventActor) {
  const skuId = newId("SKU-");
  const timestamp = now();
  const standardCost = roundMoney(input.standardCost ?? 0);

  if (standardCost < 0) {
    throw new HttpError(400, "invalid_request", "standardCost cannot be negative");
  }

  try {
    transaction(() => {
      db.prepare(
        `INSERT INTO inv_sku(sku_id, sku_code, description, category, uom, valuation_method, standard_cost, lifecycle_state, version, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'Active', 1, ?, ?)`
      ).run(
        skuId,
        input.skuCode,
        input.description,
        input.category ?? null,
        input.uom,
        input.valuationMethod,
        standardCost,
        timestamp,
        timestamp
      );

      appendEvent({
        entityId: skuId,
        entityType: "InventorySKU",
        eventType: "inv.item.created",
        version: 1,
        actor,
        payload: {
          skuCode: input.skuCode,
          valuationMethod: input.valuationMethod,
          standardCost
        }
      });
    });
  } catch (err: unknown) {
    const sqlError = err as { code?: string };
    if (sqlError.code === "SQLITE_CONSTRAINT_UNIQUE") {
      throw new HttpError(409, "duplicate_sku", `SKU code '${input.skuCode}' already exists`);
    }
    throw err;
  }

  return getSkuById(skuId);
}

export function listSkus() {
  return db.prepare("SELECT * FROM inv_sku ORDER BY created_at DESC LIMIT 200").all();
}

export function getSkuById(skuId: string) {
  return getSkuRow(skuId);
}

export function createInventoryOrganization(input: {
  name: string;
  ledgerId?: string;
  inventoryAssetAccountCode?: string;
  cogsAccountCode?: string;
}, actor?: EventActor) {
  const organizationId = newId("IORG-");
  const timestamp = now();

  if (input.ledgerId) {
    const ledger = db
      .prepare("SELECT ledger_id FROM r2r_ledger WHERE ledger_id = ?")
      .get(input.ledgerId) as { ledger_id: string } | undefined;

    if (!ledger) {
      throw new HttpError(404, "not_found", "Ledger not found");
    }
  }

  transaction(() => {
    db.prepare(
      `INSERT INTO inv_organization(organization_id, name, ledger_id, inventory_asset_account_code, cogs_account_code, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      organizationId,
      input.name,
      input.ledgerId ?? null,
      input.inventoryAssetAccountCode ?? "SYS-120-ASSET-INVENTORY",
      input.cogsAccountCode ?? "SYS-500-EXP-COGS",
      timestamp,
      timestamp
    );

    appendEvent({
      entityId: organizationId,
      entityType: "InventoryOrganization",
      eventType: "inv.organization.created",
      version: 1,
      actor,
      payload: {
        name: input.name,
        ledgerId: input.ledgerId ?? null
      }
    });
  });

  return getInventoryOrganizationById(organizationId);
}

export function listInventoryOrganizations() {
  return db.prepare("SELECT * FROM inv_organization ORDER BY created_at DESC LIMIT 200").all();
}

export function getInventoryOrganizationById(organizationId: string) {
  const row = db
    .prepare("SELECT * FROM inv_organization WHERE organization_id = ?")
    .get(organizationId) as Record<string, unknown> | undefined;

  if (!row) {
    throw new HttpError(404, "not_found", "Inventory organization not found");
  }

  return row;
}

export function postInventoryMovement(input: {
  skuId: string;
  organizationId: string;
  movementType: MovementType;
  quantity: number;
  unitCost?: number;
  reason?: string;
  referenceType?: string;
  referenceId?: string;
  correlationKey?: string;
}, actor?: EventActor) {
  const sku = getSkuRow(input.skuId);
  ensureOrganizationExists(input.organizationId);

  validateMovementInput(input.movementType, input.quantity);

  if (input.movementType === "adjustment") {
    requireTier(actor, 2, "Inventory adjustments require authority tier 2 or higher");
  }

  if (input.movementType === "cost_update") {
    requireTier(actor, 3, "Inventory cost updates require authority tier 3 or higher");
  }

  const onHandBefore = getOnHandRow(input.skuId, input.organizationId);
  const quantityBefore = onHandBefore?.quantity_on_hand ?? 0;
  const valueBefore = onHandBefore?.inventory_value ?? 0;

  const unitCost = computeUnitCost({
    sku,
    onHand: onHandBefore,
    movementType: input.movementType,
    quantity: input.quantity,
    unitCost: input.unitCost
  });

  const signedQuantity = toSignedQuantity(input.movementType, input.quantity);

  let quantityAfter = quantityBefore;
  let valueAfter = valueBefore;
  let movingAverageAfter = onHandBefore?.moving_average_cost ?? (sku.valuation_method === "standard" ? sku.standard_cost : 0);

  if (input.movementType === "cost_update") {
    if (sku.valuation_method === "standard") {
      valueAfter = roundMoney(quantityBefore * unitCost);
      movingAverageAfter = unitCost;
    } else {
      valueAfter = roundMoney(quantityBefore * unitCost);
      movingAverageAfter = unitCost;
    }
  } else {
    quantityAfter = roundMoney(quantityBefore + signedQuantity);

    if (quantityAfter < 0) {
      throw new HttpError(409, "insufficient_inventory", "Movement would result in negative on-hand quantity");
    }

    const deltaValue = roundMoney(signedQuantity * unitCost);
    valueAfter = roundMoney(valueBefore + deltaValue);

    if (valueAfter < 0) {
      valueAfter = 0;
    }

    if (sku.valuation_method === "moving_average") {
      if (quantityAfter === 0) {
        movingAverageAfter = 0;
      } else if (input.movementType === "receipt" || (input.movementType === "adjustment" && input.quantity > 0)) {
        movingAverageAfter = roundMoney(valueAfter / quantityAfter);
      }
    } else {
      movingAverageAfter = sku.standard_cost;
    }
  }

  const totalCost = roundMoney(
    input.movementType === "cost_update"
      ? valueAfter - valueBefore
      : signedQuantity * unitCost
  );

  const movementId = newId("MVT-");
  const timestamp = now();

  try {
    transaction(() => {
      if (input.movementType === "cost_update") {
        db.prepare("UPDATE inv_sku SET standard_cost = ?, version = version + 1, updated_at = ? WHERE sku_id = ?")
          .run(unitCost, timestamp, input.skuId);
      }

      upsertOnHand({
        skuId: input.skuId,
        organizationId: input.organizationId,
        quantityOnHand: quantityAfter,
        inventoryValue: valueAfter,
        movingAverageCost: movingAverageAfter
      });

      db.prepare(
        `INSERT INTO inv_movement(
          movement_id, sku_id, organization_id, movement_type, quantity, unit_cost, total_cost,
          reason, reference_type, reference_id, correlation_key, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        movementId,
        input.skuId,
        input.organizationId,
        input.movementType,
        input.quantity,
        unitCost,
        totalCost,
        input.reason ?? null,
        input.referenceType ?? null,
        input.referenceId ?? null,
        input.correlationKey ?? null,
        timestamp
      );

      const eventTypeMap: Record<MovementType, string> = {
        receipt: "inv.receipt.posted",
        issue: "inv.issue.posted",
        adjustment: "inv.adjustment.posted",
        cost_update: "inv.cost.updated"
      };

      const governance =
        input.movementType === "adjustment"
          ? { riskLevel: "High" as const, requiredTier: 2 as const, governanceTag: "INV.Adjustment.Post" }
          : input.movementType === "cost_update"
            ? { riskLevel: "High" as const, requiredTier: 3 as const, governanceTag: "INV.Cost.Update" }
            : undefined;

      appendEvent({
        entityId: movementId,
        entityType: "InventoryMovement",
        eventType: eventTypeMap[input.movementType],
        version: 1,
        actor,
        governance,
        payload: {
          skuId: input.skuId,
          organizationId: input.organizationId,
          movementType: input.movementType,
          quantity: input.quantity,
          unitCost,
          totalCost,
          quantityAfter,
          inventoryValueAfter: valueAfter,
          movingAverageCostAfter: movingAverageAfter,
          referenceType: input.referenceType,
          referenceId: input.referenceId,
          correlationKey: input.correlationKey
        }
      });
    });
  } catch (err: unknown) {
    const sqlError = err as { code?: string };
    if (sqlError.code === "SQLITE_CONSTRAINT_UNIQUE" && input.correlationKey) {
      const existing = db
        .prepare("SELECT * FROM inv_movement WHERE correlation_key = ?")
        .get(input.correlationKey) as Record<string, unknown> | undefined;

      if (existing) {
        return existing;
      }
    }

    throw err;
  }

  return getMovementById(movementId);
}

export function getMovementById(movementId: string) {
  const row = db.prepare("SELECT * FROM inv_movement WHERE movement_id = ?").get(movementId) as
    | Record<string, unknown>
    | undefined;

  if (!row) {
    throw new HttpError(404, "not_found", "Inventory movement not found");
  }

  return row;
}

export function listMovements() {
  return db.prepare("SELECT * FROM inv_movement ORDER BY created_at DESC LIMIT 500").all();
}

export function listOnHand(filters: { skuId?: string; organizationId?: string } = {}) {
  if (filters.skuId && filters.organizationId) {
    return db
      .prepare("SELECT * FROM inv_on_hand WHERE sku_id = ? AND organization_id = ?")
      .all(filters.skuId, filters.organizationId);
  }

  if (filters.skuId) {
    return db.prepare("SELECT * FROM inv_on_hand WHERE sku_id = ? ORDER BY updated_at DESC").all(filters.skuId);
  }

  if (filters.organizationId) {
    return db
      .prepare("SELECT * FROM inv_on_hand WHERE organization_id = ? ORDER BY updated_at DESC")
      .all(filters.organizationId);
  }

  return db.prepare("SELECT * FROM inv_on_hand ORDER BY updated_at DESC LIMIT 500").all();
}
