import { db, transaction } from "../../db/connection";
import { appendEvent, EventActor } from "../../events/eventStore";
import { HttpError } from "../../utils/errors";
import { newId } from "../../utils/id";

type ValuationMethod = "standard" | "moving_average";
type MovementType = "receipt" | "issue" | "adjustment" | "cost_update";
type ReservationType = "soft" | "hard";
type ReservationStatus = "Active" | "Released" | "Fulfilled" | "Cancelled";
type BinTxnType = "putaway" | "pick" | "adjustment";

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

type ProjectRow = {
  project_id: string;
  status: "Draft" | "Active" | "OnHold" | "Completed" | "Cancelled";
};

type ProjectWipRow = {
  wip_id: string;
  project_id: string;
  status: "Open" | "Closed";
  wip_material_balance: number;
  wip_total_balance: number;
  material_line_count: number;
  version: number;
};

type ReservationRow = {
  reservation_id: string;
  sku_id: string;
  organization_id: string;
  reservation_type: ReservationType;
  status: ReservationStatus;
  quantity: number;
  reference_type: string | null;
  reference_id: string | null;
  reason: string | null;
  correlation_key: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
  released_at: string | null;
  released_reason: string | null;
};

type BinRow = {
  bin_id: string;
  organization_id: string;
  bin_code: string;
  zone: string | null;
  aisle: string | null;
  rack: string | null;
  shelf_level: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
};

type BinBalanceRow = {
  bin_balance_id: string;
  sku_id: string;
  organization_id: string;
  bin_id: string;
  quantity: number;
  updated_at: string;
};

type CycleCountStatus = "Open" | "Counted" | "Posted" | "Cancelled";

type CycleCountRow = {
  cycle_count_id: string;
  organization_id: string;
  bin_id: string | null;
  status: CycleCountStatus;
  reason: string | null;
  scheduled_for: string | null;
  counted_at: string | null;
  posted_at: string | null;
  created_at: string;
  updated_at: string;
};

type CycleCountLineRow = {
  cycle_count_line_id: string;
  cycle_count_id: string;
  sku_id: string;
  expected_quantity: number;
  counted_quantity: number;
  variance_quantity: number;
  reason: string | null;
  counted_at: string;
  created_at: string;
  updated_at: string;
};

type LotStatus = "Active" | "Hold" | "Consumed" | "Expired";
type SerialStatus = "Available" | "Allocated" | "Consumed" | "Hold";

type LotRow = {
  lot_id: string;
  sku_id: string;
  organization_id: string;
  lot_code: string;
  manufacture_date: string | null;
  expiry_date: string | null;
  status: LotStatus;
  quantity_on_hand: number;
  created_at: string;
  updated_at: string;
};

type SerialRow = {
  serial_id: string;
  sku_id: string;
  organization_id: string;
  lot_id: string | null;
  serial_number: string;
  status: SerialStatus;
  created_at: string;
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

function getProjectRow(projectId: string): ProjectRow {
  const row = db
    .prepare("SELECT project_id, status FROM proj_project WHERE project_id = ?")
    .get(projectId) as ProjectRow | undefined;

  if (!row) {
    throw new HttpError(404, "not_found", "Project not found");
  }

  return row;
}

function getProjectWipByProjectId(projectId: string): ProjectWipRow {
  const row = db
    .prepare(
      `SELECT wip_id, project_id, status, wip_material_balance, wip_total_balance, material_line_count, version
       FROM proj_wip WHERE project_id = ?`
    )
    .get(projectId) as ProjectWipRow | undefined;

  if (!row) {
    throw new HttpError(404, "not_found", "Project WIP not found for project");
  }

  return row;
}

function getProjectWipById(wipId: string): ProjectWipRow {
  const row = db
    .prepare(
      `SELECT wip_id, project_id, status, wip_material_balance, wip_total_balance, material_line_count, version
       FROM proj_wip WHERE wip_id = ?`
    )
    .get(wipId) as ProjectWipRow | undefined;

  if (!row) {
    throw new HttpError(404, "not_found", "Project WIP not found");
  }

  return row;
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

function getReservationRow(reservationId: string): ReservationRow {
  const row = db
    .prepare("SELECT * FROM inv_reservation WHERE reservation_id = ?")
    .get(reservationId) as ReservationRow | undefined;

  if (!row) {
    throw new HttpError(404, "not_found", "Inventory reservation not found");
  }

  return row;
}

function getActiveHardReservedQuantity(skuId: string, organizationId: string): number {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(quantity), 0) AS reserved_quantity
       FROM inv_reservation
       WHERE sku_id = ?
         AND organization_id = ?
         AND reservation_type = 'hard'
         AND status = 'Active'`
    )
    .get(skuId, organizationId) as { reserved_quantity: number } | undefined;

  return Number(row?.reserved_quantity ?? 0);
}

function getBinRow(binId: string): BinRow {
  const row = db.prepare("SELECT * FROM inv_bin WHERE bin_id = ?").get(binId) as BinRow | undefined;

  if (!row) {
    throw new HttpError(404, "not_found", "Inventory bin not found");
  }

  return row;
}

function getBinBalanceRow(skuId: string, organizationId: string, binId: string): BinBalanceRow | undefined {
  return db
    .prepare("SELECT * FROM inv_bin_balance WHERE sku_id = ? AND organization_id = ? AND bin_id = ?")
    .get(skuId, organizationId, binId) as BinBalanceRow | undefined;
}

function upsertBinBalance(input: { skuId: string; organizationId: string; binId: string; quantity: number }): BinBalanceRow {
  const timestamp = now();
  const existing = getBinBalanceRow(input.skuId, input.organizationId, input.binId);

  if (existing) {
    db.prepare(
      `UPDATE inv_bin_balance
       SET quantity = ?, updated_at = ?
       WHERE bin_balance_id = ?`
    ).run(input.quantity, timestamp, existing.bin_balance_id);

    return {
      ...existing,
      quantity: input.quantity,
      updated_at: timestamp
    };
  }

  const binBalanceId = newId("BINB-");
  db.prepare(
    `INSERT INTO inv_bin_balance(bin_balance_id, sku_id, organization_id, bin_id, quantity, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(binBalanceId, input.skuId, input.organizationId, input.binId, input.quantity, timestamp);

  return {
    bin_balance_id: binBalanceId,
    sku_id: input.skuId,
    organization_id: input.organizationId,
    bin_id: input.binId,
    quantity: input.quantity,
    updated_at: timestamp
  };
}

function getTotalAllocatedBinQuantity(skuId: string, organizationId: string): number {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(quantity), 0) AS allocated_quantity
       FROM inv_bin_balance
       WHERE sku_id = ? AND organization_id = ?`
    )
    .get(skuId, organizationId) as { allocated_quantity: number } | undefined;

  return Number(row?.allocated_quantity ?? 0);
}

function insertBinTransaction(input: {
  txnType: BinTxnType;
  skuId: string;
  organizationId: string;
  binId: string;
  quantity: number;
  reason?: string;
  referenceType?: string;
  referenceId?: string;
  correlationKey?: string;
}): string {
  const binTxnId = newId("BINTX-");
  db.prepare(
    `INSERT INTO inv_bin_txn(
      bin_txn_id, txn_type, sku_id, organization_id, bin_id, quantity,
      reason, reference_type, reference_id, correlation_key, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    binTxnId,
    input.txnType,
    input.skuId,
    input.organizationId,
    input.binId,
    input.quantity,
    input.reason ?? null,
    input.referenceType ?? null,
    input.referenceId ?? null,
    input.correlationKey ?? null,
    now()
  );

  return binTxnId;
}

function getCycleCountRow(cycleCountId: string): CycleCountRow {
  const row = db
    .prepare("SELECT * FROM inv_cycle_count WHERE cycle_count_id = ?")
    .get(cycleCountId) as CycleCountRow | undefined;

  if (!row) {
    throw new HttpError(404, "not_found", "Inventory cycle count not found");
  }

  return row;
}

function listCycleCountLinesByCountId(cycleCountId: string): CycleCountLineRow[] {
  return db
    .prepare("SELECT * FROM inv_cycle_count_line WHERE cycle_count_id = ? ORDER BY created_at ASC")
    .all(cycleCountId) as CycleCountLineRow[];
}

function getLotRow(lotId: string): LotRow {
  const row = db.prepare("SELECT * FROM inv_lot WHERE lot_id = ?").get(lotId) as LotRow | undefined;
  if (!row) {
    throw new HttpError(404, "not_found", "Inventory lot not found");
  }

  return row;
}

function getSerialRow(serialId: string): SerialRow {
  const row = db.prepare("SELECT * FROM inv_serial WHERE serial_id = ?").get(serialId) as SerialRow | undefined;
  if (!row) {
    throw new HttpError(404, "not_found", "Inventory serial not found");
  }

  return row;
}

function getTrackedLotQuantity(skuId: string, organizationId: string): number {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(quantity_on_hand), 0) AS tracked_quantity
       FROM inv_lot
       WHERE sku_id = ?
         AND organization_id = ?
         AND status IN ('Active', 'Hold', 'Expired')`
    )
    .get(skuId, organizationId) as { tracked_quantity: number } | undefined;

  return Number(row?.tracked_quantity ?? 0);
}

function updateOnHandForCycleCountVariance(input: {
  sku: SkuRow;
  organizationId: string;
  varianceQuantity: number;
  timestamp: string;
}): { quantityAfter: number; inventoryValueAfter: number; unitCost: number } {
  const onHand = getOnHandRow(input.sku.sku_id, input.organizationId);
  const quantityBefore = onHand?.quantity_on_hand ?? 0;
  const valueBefore = onHand?.inventory_value ?? 0;

  const unitCost =
    input.sku.valuation_method === "standard"
      ? input.sku.standard_cost
      : roundMoney(onHand?.moving_average_cost ?? 0);

  const quantityAfter = roundMoney(quantityBefore + input.varianceQuantity);
  if (quantityAfter < 0) {
    throw new HttpError(409, "insufficient_inventory", "Cycle count variance would result in negative on-hand quantity");
  }

  const deltaValue = roundMoney(input.varianceQuantity * unitCost);
  const inventoryValueAfter = roundMoney(Math.max(0, valueBefore + deltaValue));
  const movingAverageAfter =
    input.sku.valuation_method === "standard"
      ? input.sku.standard_cost
      : quantityAfter === 0
        ? 0
        : roundMoney(onHand?.moving_average_cost ?? unitCost);

  upsertOnHand({
    skuId: input.sku.sku_id,
    organizationId: input.organizationId,
    quantityOnHand: quantityAfter,
    inventoryValue: inventoryValueAfter,
    movingAverageCost: movingAverageAfter
  });

  return { quantityAfter, inventoryValueAfter, unitCost };
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
  projectId?: string;
  projectWipId?: string;
  bomId?: string;
  bomComponentFlag?: boolean;
  isProjectFinishedGood?: boolean;
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

  let linkedProjectWip: ProjectWipRow | undefined;
  if (input.projectId || input.projectWipId) {
    const projectId = input.projectId ?? getProjectWipById(input.projectWipId as string).project_id;
    const project = getProjectRow(projectId);

    if (project.status !== "Active" && project.status !== "OnHold") {
      throw new HttpError(400, "invalid_state", "Project must be Active or OnHold for inventory linkage");
    }

    linkedProjectWip = input.projectWipId
      ? getProjectWipById(input.projectWipId)
      : getProjectWipByProjectId(projectId);

    if (linkedProjectWip.project_id !== projectId) {
      throw new HttpError(400, "invalid_request", "projectWipId does not belong to provided projectId");
    }

    if (linkedProjectWip.status !== "Open") {
      throw new HttpError(400, "invalid_state", "Project WIP is closed");
    }
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
          reason, reference_type, reference_id, correlation_key,
          project_id, project_wip_id, bom_id, bom_component_flag, is_project_finished_good,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
        input.projectId ?? linkedProjectWip?.project_id ?? null,
        linkedProjectWip?.wip_id ?? input.projectWipId ?? null,
        input.bomId ?? null,
        input.bomComponentFlag ? 1 : 0,
        input.isProjectFinishedGood ? 1 : 0,
        timestamp
      );

      if (input.movementType === "issue" && linkedProjectWip) {
        const postedCost = Math.abs(totalCost);

        db.prepare(
          `UPDATE proj_wip
           SET wip_material_balance = wip_material_balance + ?,
               wip_total_balance = wip_total_balance + ?,
               material_line_count = material_line_count + 1,
               last_material_posted_at = ?,
               version = version + 1
           WHERE wip_id = ?`
        ).run(postedCost, postedCost, timestamp, linkedProjectWip.wip_id);

        db.prepare(
          `UPDATE proj_project
           SET wip_material_balance = wip_material_balance + ?,
               wip_total_balance = wip_total_balance + ?,
               actual_cost_amount = actual_cost_amount + ?,
               version = version + 1,
               last_event_at = ?
           WHERE project_id = ?`
        ).run(postedCost, postedCost, postedCost, timestamp, linkedProjectWip.project_id);

        appendEvent({
          entityId: linkedProjectWip.wip_id,
          entityType: "project_wip",
          eventType: "proj.wip_material_posted",
          version: linkedProjectWip.version + 1,
          actor,
          governance: {
            riskLevel: "Medium",
            requiredTier: 1,
            governanceTag: "project_wip_material_post"
          },
          payload: {
            wipId: linkedProjectWip.wip_id,
            projectId: linkedProjectWip.project_id,
            inventoryIssueEventId: movementId,
            skuId: input.skuId,
            quantity: input.quantity,
            quantityUom: sku.uom,
            unitCost,
            totalCost: postedCost,
            costElement: "MATERIAL",
            postedAt: timestamp
          }
        });
      }

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
          projectId: input.projectId ?? linkedProjectWip?.project_id,
          projectWipId: linkedProjectWip?.wip_id ?? input.projectWipId,
          bomId: input.bomId,
          bomComponentFlag: input.bomComponentFlag ?? false,
          isProjectFinishedGood: input.isProjectFinishedGood ?? false,
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

export function createReservation(input: {
  skuId: string;
  organizationId: string;
  reservationType: ReservationType;
  quantity: number;
  referenceType?: string;
  referenceId?: string;
  reason?: string;
  correlationKey?: string;
  expiresAt?: string;
}, actor?: EventActor) {
  getSkuRow(input.skuId);
  ensureOrganizationExists(input.organizationId);

  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    throw new HttpError(400, "invalid_request", "Reservation quantity must be greater than zero");
  }

  if (input.reservationType === "hard") {
    const onHand = getOnHandRow(input.skuId, input.organizationId);
    const availableOnHand = onHand?.quantity_on_hand ?? 0;
    const activeHardReserved = getActiveHardReservedQuantity(input.skuId, input.organizationId);
    const availableForHardReservation = roundMoney(availableOnHand - activeHardReserved);

    if (input.quantity > availableForHardReservation) {
      throw new HttpError(
        409,
        "insufficient_available_inventory",
        "Hard reservation exceeds currently available on-hand inventory"
      );
    }
  }

  const reservationId = newId("RSV-");
  const timestamp = now();

  try {
    transaction(() => {
      db.prepare(
        `INSERT INTO inv_reservation(
          reservation_id, sku_id, organization_id, reservation_type, status, quantity,
          reference_type, reference_id, reason, correlation_key, expires_at,
          created_at, updated_at, released_at, released_reason
        ) VALUES (?, ?, ?, ?, 'Active', ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)`
      ).run(
        reservationId,
        input.skuId,
        input.organizationId,
        input.reservationType,
        roundMoney(input.quantity),
        input.referenceType ?? null,
        input.referenceId ?? null,
        input.reason ?? null,
        input.correlationKey ?? null,
        input.expiresAt ?? null,
        timestamp,
        timestamp
      );

      appendEvent({
        entityId: reservationId,
        entityType: "InventoryReservation",
        eventType: "inv.reservation.created",
        version: 1,
        actor,
        governance:
          input.reservationType === "hard"
            ? { riskLevel: "Medium", requiredTier: 1, governanceTag: "INV.Reservation.Hard" }
            : { riskLevel: "Low", requiredTier: 1, governanceTag: "INV.Reservation.Soft" },
        payload: {
          skuId: input.skuId,
          organizationId: input.organizationId,
          reservationType: input.reservationType,
          quantity: roundMoney(input.quantity),
          status: "Active",
          referenceType: input.referenceType,
          referenceId: input.referenceId,
          reason: input.reason,
          correlationKey: input.correlationKey,
          expiresAt: input.expiresAt
        }
      });
    });
  } catch (err: unknown) {
    const sqlError = err as { code?: string };
    if (sqlError.code === "SQLITE_CONSTRAINT_UNIQUE" && input.correlationKey) {
      const existing = db
        .prepare("SELECT * FROM inv_reservation WHERE correlation_key = ?")
        .get(input.correlationKey) as Record<string, unknown> | undefined;

      if (existing) {
        return existing;
      }
    }

    throw err;
  }

  return getReservationById(reservationId);
}

export function getReservationById(reservationId: string) {
  return getReservationRow(reservationId);
}

export function releaseReservation(
  reservationId: string,
  input: { reason?: string; expectedVersion?: number } = {},
  actor?: EventActor
) {
  const existing = getReservationRow(reservationId);

  if (existing.status !== "Active") {
    throw new HttpError(409, "invalid_state", "Only active reservations can be released");
  }

  const timestamp = now();

  transaction(() => {
    db.prepare(
      `UPDATE inv_reservation
       SET status = 'Released', updated_at = ?, released_at = ?, released_reason = ?
       WHERE reservation_id = ?`
    ).run(timestamp, timestamp, input.reason ?? null, reservationId);

    appendEvent({
      entityId: reservationId,
      entityType: "InventoryReservation",
      eventType: "inv.reservation.released",
      version: (input.expectedVersion ?? 1) + 1,
      actor,
      governance: { riskLevel: "Low", requiredTier: 1, governanceTag: "INV.Reservation.Release" },
      payload: {
        reservationId,
        skuId: existing.sku_id,
        organizationId: existing.organization_id,
        reservationType: existing.reservation_type,
        quantity: existing.quantity,
        reason: input.reason ?? null
      }
    });
  });

  return getReservationById(reservationId);
}

export function listReservations(filters: {
  skuId?: string;
  organizationId?: string;
  status?: ReservationStatus;
  reservationType?: ReservationType;
} = {}) {
  const clauses: string[] = [];
  const params: Array<string> = [];

  if (filters.skuId) {
    clauses.push("sku_id = ?");
    params.push(filters.skuId);
  }

  if (filters.organizationId) {
    clauses.push("organization_id = ?");
    params.push(filters.organizationId);
  }

  if (filters.status) {
    clauses.push("status = ?");
    params.push(filters.status);
  }

  if (filters.reservationType) {
    clauses.push("reservation_type = ?");
    params.push(filters.reservationType);
  }

  const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";

  return db
    .prepare(`SELECT * FROM inv_reservation ${whereClause} ORDER BY created_at DESC LIMIT 500`)
    .all(...params);
}

export function createInventoryBin(input: {
  organizationId: string;
  binCode: string;
  zone?: string;
  aisle?: string;
  rack?: string;
  shelfLevel?: string;
}, actor?: EventActor) {
  ensureOrganizationExists(input.organizationId);

  const binId = newId("BIN-");
  const timestamp = now();

  try {
    transaction(() => {
      db.prepare(
        `INSERT INTO inv_bin(
          bin_id, organization_id, bin_code, zone, aisle, rack, shelf_level, is_active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
      ).run(
        binId,
        input.organizationId,
        input.binCode,
        input.zone ?? null,
        input.aisle ?? null,
        input.rack ?? null,
        input.shelfLevel ?? null,
        timestamp,
        timestamp
      );

      appendEvent({
        entityId: binId,
        entityType: "InventoryBin",
        eventType: "inv.bin.created",
        version: 1,
        actor,
        governance: { riskLevel: "Low", requiredTier: 1, governanceTag: "INV.Bin.Create" },
        payload: {
          organizationId: input.organizationId,
          binCode: input.binCode,
          zone: input.zone,
          aisle: input.aisle,
          rack: input.rack,
          shelfLevel: input.shelfLevel
        }
      });
    });
  } catch (err: unknown) {
    const sqlError = err as { code?: string };
    if (sqlError.code === "SQLITE_CONSTRAINT_UNIQUE") {
      throw new HttpError(409, "duplicate_bin_code", `Bin code '${input.binCode}' already exists in this organization`);
    }

    throw err;
  }

  return getInventoryBinById(binId);
}

export function getInventoryBinById(binId: string) {
  return getBinRow(binId);
}

export function listInventoryBins(filters: { organizationId?: string; isActive?: boolean } = {}) {
  if (filters.organizationId !== undefined && filters.isActive !== undefined) {
    return db
      .prepare("SELECT * FROM inv_bin WHERE organization_id = ? AND is_active = ? ORDER BY bin_code ASC LIMIT 500")
      .all(filters.organizationId, filters.isActive ? 1 : 0);
  }

  if (filters.organizationId !== undefined) {
    return db.prepare("SELECT * FROM inv_bin WHERE organization_id = ? ORDER BY bin_code ASC LIMIT 500").all(filters.organizationId);
  }

  if (filters.isActive !== undefined) {
    return db.prepare("SELECT * FROM inv_bin WHERE is_active = ? ORDER BY organization_id ASC, bin_code ASC LIMIT 500").all(filters.isActive ? 1 : 0);
  }

  return db.prepare("SELECT * FROM inv_bin ORDER BY organization_id ASC, bin_code ASC LIMIT 500").all();
}

export function listBinBalances(filters: { binId?: string; skuId?: string; organizationId?: string } = {}) {
  const clauses: string[] = [];
  const params: string[] = [];

  if (filters.binId) {
    clauses.push("bin_id = ?");
    params.push(filters.binId);
  }

  if (filters.skuId) {
    clauses.push("sku_id = ?");
    params.push(filters.skuId);
  }

  if (filters.organizationId) {
    clauses.push("organization_id = ?");
    params.push(filters.organizationId);
  }

  const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  return db
    .prepare(`SELECT * FROM inv_bin_balance ${whereClause} ORDER BY updated_at DESC LIMIT 500`)
    .all(...params);
}

export function putawayToBin(input: {
  skuId: string;
  organizationId: string;
  binId: string;
  quantity: number;
  reason?: string;
  referenceType?: string;
  referenceId?: string;
  correlationKey?: string;
}, actor?: EventActor) {
  getSkuRow(input.skuId);
  ensureOrganizationExists(input.organizationId);

  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    throw new HttpError(400, "invalid_request", "Putaway quantity must be greater than zero");
  }

  const bin = getBinRow(input.binId);
  if (bin.organization_id !== input.organizationId) {
    throw new HttpError(400, "invalid_request", "Bin does not belong to the provided organization");
  }

  if (bin.is_active !== 1) {
    throw new HttpError(409, "invalid_state", "Bin is inactive");
  }

  const onHand = getOnHandRow(input.skuId, input.organizationId);
  const onHandQuantity = onHand?.quantity_on_hand ?? 0;
  const currentlyAllocated = getTotalAllocatedBinQuantity(input.skuId, input.organizationId);
  const unallocatedQuantity = roundMoney(onHandQuantity - currentlyAllocated);

  if (input.quantity > unallocatedQuantity) {
    throw new HttpError(409, "insufficient_unallocated_on_hand", "Putaway exceeds unallocated on-hand quantity");
  }

  const currentBinBalance = getBinBalanceRow(input.skuId, input.organizationId, input.binId);
  const balanceAfter = roundMoney((currentBinBalance?.quantity ?? 0) + input.quantity);

  let result: Record<string, unknown> = {};

  try {
    transaction(() => {
      const updatedBalance = upsertBinBalance({
        skuId: input.skuId,
        organizationId: input.organizationId,
        binId: input.binId,
        quantity: balanceAfter
      });

      const binTxnId = insertBinTransaction({
        txnType: "putaway",
        skuId: input.skuId,
        organizationId: input.organizationId,
        binId: input.binId,
        quantity: input.quantity,
        reason: input.reason,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        correlationKey: input.correlationKey
      });

      appendEvent({
        entityId: binTxnId,
        entityType: "InventoryBinMovement",
        eventType: "inv.putaway.posted",
        version: 1,
        actor,
        governance: { riskLevel: "Low", requiredTier: 1, governanceTag: "INV.Putaway.Post" },
        payload: {
          skuId: input.skuId,
          organizationId: input.organizationId,
          binId: input.binId,
          quantity: input.quantity,
          balanceAfter,
          reason: input.reason,
          referenceType: input.referenceType,
          referenceId: input.referenceId,
          correlationKey: input.correlationKey
        }
      });

      result = {
        binTxnId,
        operation: "putaway",
        skuId: input.skuId,
        organizationId: input.organizationId,
        binId: input.binId,
        quantity: input.quantity,
        balanceAfter: updatedBalance.quantity
      };
    });
  } catch (err: unknown) {
    const sqlError = err as { code?: string };
    if (sqlError.code === "SQLITE_CONSTRAINT_UNIQUE" && input.correlationKey) {
      const existing = db
        .prepare("SELECT * FROM inv_bin_txn WHERE correlation_key = ?")
        .get(input.correlationKey) as { bin_txn_id: string; sku_id: string; organization_id: string; bin_id: string; quantity: number } | undefined;

      if (existing) {
        return {
          binTxnId: existing.bin_txn_id,
          operation: "putaway",
          skuId: existing.sku_id,
          organizationId: existing.organization_id,
          binId: existing.bin_id,
          quantity: existing.quantity
        };
      }
    }

    throw err;
  }

  return result;
}

export function pickFromBin(input: {
  skuId: string;
  organizationId: string;
  binId: string;
  quantity: number;
  reason?: string;
  referenceType?: string;
  referenceId?: string;
  correlationKey?: string;
}, actor?: EventActor) {
  getSkuRow(input.skuId);
  ensureOrganizationExists(input.organizationId);

  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    throw new HttpError(400, "invalid_request", "Pick quantity must be greater than zero");
  }

  const bin = getBinRow(input.binId);
  if (bin.organization_id !== input.organizationId) {
    throw new HttpError(400, "invalid_request", "Bin does not belong to the provided organization");
  }

  if (bin.is_active !== 1) {
    throw new HttpError(409, "invalid_state", "Bin is inactive");
  }

  const currentBinBalance = getBinBalanceRow(input.skuId, input.organizationId, input.binId);
  const currentQuantity = currentBinBalance?.quantity ?? 0;
  if (input.quantity > currentQuantity) {
    throw new HttpError(409, "insufficient_bin_quantity", "Pick quantity exceeds available bin quantity");
  }

  const balanceAfter = roundMoney(currentQuantity - input.quantity);
  let result: Record<string, unknown> = {};

  try {
    transaction(() => {
      const updatedBalance = upsertBinBalance({
        skuId: input.skuId,
        organizationId: input.organizationId,
        binId: input.binId,
        quantity: balanceAfter
      });

      const binTxnId = insertBinTransaction({
        txnType: "pick",
        skuId: input.skuId,
        organizationId: input.organizationId,
        binId: input.binId,
        quantity: -input.quantity,
        reason: input.reason,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        correlationKey: input.correlationKey
      });

      appendEvent({
        entityId: binTxnId,
        entityType: "InventoryBinMovement",
        eventType: "inv.pick.posted",
        version: 1,
        actor,
        governance: { riskLevel: "Low", requiredTier: 1, governanceTag: "INV.Pick.Post" },
        payload: {
          skuId: input.skuId,
          organizationId: input.organizationId,
          binId: input.binId,
          quantity: input.quantity,
          balanceAfter,
          reason: input.reason,
          referenceType: input.referenceType,
          referenceId: input.referenceId,
          correlationKey: input.correlationKey
        }
      });

      result = {
        binTxnId,
        operation: "pick",
        skuId: input.skuId,
        organizationId: input.organizationId,
        binId: input.binId,
        quantity: input.quantity,
        balanceAfter: updatedBalance.quantity
      };
    });
  } catch (err: unknown) {
    const sqlError = err as { code?: string };
    if (sqlError.code === "SQLITE_CONSTRAINT_UNIQUE" && input.correlationKey) {
      const existing = db
        .prepare("SELECT * FROM inv_bin_txn WHERE correlation_key = ?")
        .get(input.correlationKey) as { bin_txn_id: string; sku_id: string; organization_id: string; bin_id: string; quantity: number } | undefined;

      if (existing) {
        return {
          binTxnId: existing.bin_txn_id,
          operation: "pick",
          skuId: existing.sku_id,
          organizationId: existing.organization_id,
          binId: existing.bin_id,
          quantity: Math.abs(existing.quantity)
        };
      }
    }

    throw err;
  }

  return result;
}

export function createCycleCount(input: {
  organizationId: string;
  binId?: string;
  reason?: string;
  scheduledFor?: string;
}, actor?: EventActor) {
  ensureOrganizationExists(input.organizationId);

  if (input.binId) {
    const bin = getBinRow(input.binId);
    if (bin.organization_id !== input.organizationId) {
      throw new HttpError(400, "invalid_request", "Bin does not belong to the provided organization");
    }
  }

  const cycleCountId = newId("CC-");
  const timestamp = now();

  transaction(() => {
    db.prepare(
      `INSERT INTO inv_cycle_count(
        cycle_count_id, organization_id, bin_id, status, reason, scheduled_for, counted_at, posted_at, created_at, updated_at
      ) VALUES (?, ?, ?, 'Open', ?, ?, NULL, NULL, ?, ?)`
    ).run(
      cycleCountId,
      input.organizationId,
      input.binId ?? null,
      input.reason ?? null,
      input.scheduledFor ?? null,
      timestamp,
      timestamp
    );

    appendEvent({
      entityId: cycleCountId,
      entityType: "InventoryCycleCount",
      eventType: "inv.cycle_count.created",
      version: 1,
      actor,
      governance: { riskLevel: "Low", requiredTier: 1, governanceTag: "INV.CycleCount.Create" },
      payload: {
        organizationId: input.organizationId,
        binId: input.binId,
        reason: input.reason,
        scheduledFor: input.scheduledFor
      }
    });
  });

  return getCycleCountById(cycleCountId);
}

export function getCycleCountById(cycleCountId: string) {
  return getCycleCountRow(cycleCountId);
}

export function listCycleCounts(filters: {
  organizationId?: string;
  binId?: string;
  status?: CycleCountStatus;
} = {}) {
  const clauses: string[] = [];
  const params: string[] = [];

  if (filters.organizationId) {
    clauses.push("organization_id = ?");
    params.push(filters.organizationId);
  }

  if (filters.binId) {
    clauses.push("bin_id = ?");
    params.push(filters.binId);
  }

  if (filters.status) {
    clauses.push("status = ?");
    params.push(filters.status);
  }

  const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  return db
    .prepare(`SELECT * FROM inv_cycle_count ${whereClause} ORDER BY created_at DESC LIMIT 500`)
    .all(...params);
}

export function listCycleCountLines(cycleCountId: string) {
  getCycleCountRow(cycleCountId);
  return listCycleCountLinesByCountId(cycleCountId);
}

export function recordCycleCountLine(input: {
  cycleCountId: string;
  skuId: string;
  countedQuantity: number;
  reason?: string;
}, actor?: EventActor) {
  const cycleCount = getCycleCountRow(input.cycleCountId);
  if (cycleCount.status !== "Open" && cycleCount.status !== "Counted") {
    throw new HttpError(409, "invalid_state", "Cycle count lines can only be recorded while count is Open or Counted");
  }

  const sku = getSkuRow(input.skuId);
  if (!Number.isFinite(input.countedQuantity) || input.countedQuantity < 0) {
    throw new HttpError(400, "invalid_request", "countedQuantity must be a non-negative number");
  }

  const expectedQuantity = cycleCount.bin_id
    ? getBinBalanceRow(input.skuId, cycleCount.organization_id, cycleCount.bin_id)?.quantity ?? 0
    : getOnHandRow(input.skuId, cycleCount.organization_id)?.quantity_on_hand ?? 0;

  const varianceQuantity = roundMoney(input.countedQuantity - expectedQuantity);
  const timestamp = now();

  transaction(() => {
    const existing = db
      .prepare("SELECT cycle_count_line_id FROM inv_cycle_count_line WHERE cycle_count_id = ? AND sku_id = ?")
      .get(input.cycleCountId, input.skuId) as { cycle_count_line_id: string } | undefined;

    if (existing) {
      db.prepare(
        `UPDATE inv_cycle_count_line
         SET expected_quantity = ?, counted_quantity = ?, variance_quantity = ?, reason = ?, counted_at = ?, updated_at = ?
         WHERE cycle_count_line_id = ?`
      ).run(
        expectedQuantity,
        input.countedQuantity,
        varianceQuantity,
        input.reason ?? null,
        timestamp,
        timestamp,
        existing.cycle_count_line_id
      );
    } else {
      db.prepare(
        `INSERT INTO inv_cycle_count_line(
          cycle_count_line_id, cycle_count_id, sku_id, expected_quantity, counted_quantity,
          variance_quantity, reason, counted_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        newId("CCL-"),
        input.cycleCountId,
        input.skuId,
        expectedQuantity,
        input.countedQuantity,
        varianceQuantity,
        input.reason ?? null,
        timestamp,
        timestamp,
        timestamp
      );
    }

    db.prepare(
      `UPDATE inv_cycle_count
       SET status = 'Counted', counted_at = ?, updated_at = ?
       WHERE cycle_count_id = ?`
    ).run(timestamp, timestamp, input.cycleCountId);

    appendEvent({
      entityId: input.cycleCountId,
      entityType: "InventoryCycleCount",
      eventType: "inv.cycle_count.line_recorded",
      version: 1,
      actor,
      governance: { riskLevel: "Low", requiredTier: 1, governanceTag: "INV.CycleCount.RecordLine" },
      payload: {
        cycleCountId: input.cycleCountId,
        skuId: sku.sku_id,
        expectedQuantity,
        countedQuantity: input.countedQuantity,
        varianceQuantity,
        reason: input.reason
      }
    });
  });

  return listCycleCountLinesByCountId(input.cycleCountId).find((line) => line.sku_id === input.skuId);
}

export function postCycleCount(cycleCountId: string, actor?: EventActor) {
  const cycleCount = getCycleCountRow(cycleCountId);
  if (cycleCount.status !== "Counted") {
    throw new HttpError(409, "invalid_state", "Cycle count must be in Counted status before posting");
  }

  const lines = listCycleCountLinesByCountId(cycleCountId);
  if (lines.length === 0) {
    throw new HttpError(409, "invalid_state", "Cycle count has no lines to post");
  }

  const timestamp = now();

  transaction(() => {
    for (const line of lines) {
      if (line.variance_quantity === 0) {
        continue;
      }

      const sku = getSkuRow(line.sku_id);
      const onHandUpdate = updateOnHandForCycleCountVariance({
        sku,
        organizationId: cycleCount.organization_id,
        varianceQuantity: line.variance_quantity,
        timestamp
      });

      if (cycleCount.bin_id) {
        upsertBinBalance({
          skuId: line.sku_id,
          organizationId: cycleCount.organization_id,
          binId: cycleCount.bin_id,
          quantity: line.counted_quantity
        });
      }

      const movementId = newId("MVT-");
      db.prepare(
        `INSERT INTO inv_movement(
          movement_id, sku_id, organization_id, movement_type, quantity, unit_cost, total_cost,
          reason, reference_type, reference_id, correlation_key,
          project_id, project_wip_id, bom_id, bom_component_flag, is_project_finished_good,
          created_at
        ) VALUES (?, ?, ?, 'adjustment', ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, 0, 0, ?)`
      ).run(
        movementId,
        line.sku_id,
        cycleCount.organization_id,
        line.variance_quantity,
        onHandUpdate.unitCost,
        roundMoney(line.variance_quantity * onHandUpdate.unitCost),
        "cycle_count_variance",
        "cycle_count",
        cycleCountId,
        null,
        timestamp
      );

      appendEvent({
        entityId: movementId,
        entityType: "InventoryMovement",
        eventType: "inv.adjustment.posted",
        version: 1,
        actor,
        governance: { riskLevel: "High", requiredTier: 2, governanceTag: "INV.CycleCount.Post" },
        payload: {
          skuId: line.sku_id,
          organizationId: cycleCount.organization_id,
          movementType: "adjustment",
          quantity: line.variance_quantity,
          unitCost: onHandUpdate.unitCost,
          totalCost: roundMoney(line.variance_quantity * onHandUpdate.unitCost),
          referenceType: "cycle_count",
          referenceId: cycleCountId,
          quantityAfter: onHandUpdate.quantityAfter,
          inventoryValueAfter: onHandUpdate.inventoryValueAfter
        }
      });
    }

    db.prepare(
      `UPDATE inv_cycle_count
       SET status = 'Posted', posted_at = ?, updated_at = ?
       WHERE cycle_count_id = ?`
    ).run(timestamp, timestamp, cycleCountId);

    appendEvent({
      entityId: cycleCountId,
      entityType: "InventoryCycleCount",
      eventType: "inv.cycle_count.posted",
      version: 1,
      actor,
      governance: { riskLevel: "High", requiredTier: 2, governanceTag: "INV.CycleCount.Post" },
      payload: {
        cycleCountId,
        organizationId: cycleCount.organization_id,
        binId: cycleCount.bin_id,
        lineCount: lines.length,
        postedAt: timestamp
      }
    });
  });

  return getCycleCountById(cycleCountId);
}

export function createInventoryLot(input: {
  skuId: string;
  organizationId: string;
  lotCode: string;
  quantityOnHand: number;
  manufactureDate?: string;
  expiryDate?: string;
}, actor?: EventActor) {
  getSkuRow(input.skuId);
  ensureOrganizationExists(input.organizationId);

  if (!Number.isFinite(input.quantityOnHand) || input.quantityOnHand <= 0) {
    throw new HttpError(400, "invalid_request", "Lot quantityOnHand must be greater than zero");
  }

  const onHand = getOnHandRow(input.skuId, input.organizationId);
  const totalOnHand = onHand?.quantity_on_hand ?? 0;
  const trackedLotQuantity = getTrackedLotQuantity(input.skuId, input.organizationId);
  const availableUntracked = roundMoney(totalOnHand - trackedLotQuantity);

  if (input.quantityOnHand > availableUntracked) {
    throw new HttpError(409, "insufficient_untracked_on_hand", "Lot quantity exceeds available untracked on-hand quantity");
  }

  const lotId = newId("LOT-");
  const timestamp = now();

  try {
    transaction(() => {
      db.prepare(
        `INSERT INTO inv_lot(
          lot_id, sku_id, organization_id, lot_code, manufacture_date, expiry_date,
          status, quantity_on_hand, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'Active', ?, ?, ?)`
      ).run(
        lotId,
        input.skuId,
        input.organizationId,
        input.lotCode,
        input.manufactureDate ?? null,
        input.expiryDate ?? null,
        roundMoney(input.quantityOnHand),
        timestamp,
        timestamp
      );

      appendEvent({
        entityId: lotId,
        entityType: "InventoryLot",
        eventType: "inv.lot.created",
        version: 1,
        actor,
        governance: { riskLevel: "Low", requiredTier: 1, governanceTag: "INV.Lot.Create" },
        payload: {
          skuId: input.skuId,
          organizationId: input.organizationId,
          lotCode: input.lotCode,
          quantityOnHand: roundMoney(input.quantityOnHand),
          manufactureDate: input.manufactureDate,
          expiryDate: input.expiryDate
        }
      });
    });
  } catch (err: unknown) {
    const sqlError = err as { code?: string };
    if (sqlError.code === "SQLITE_CONSTRAINT_UNIQUE") {
      throw new HttpError(409, "duplicate_lot_code", `Lot code '${input.lotCode}' already exists for this SKU and organization`);
    }

    throw err;
  }

  return getInventoryLotById(lotId);
}

export function getInventoryLotById(lotId: string) {
  return getLotRow(lotId);
}

export function listInventoryLots(filters: {
  skuId?: string;
  organizationId?: string;
  status?: LotStatus;
} = {}) {
  const clauses: string[] = [];
  const params: string[] = [];

  if (filters.skuId) {
    clauses.push("sku_id = ?");
    params.push(filters.skuId);
  }

  if (filters.organizationId) {
    clauses.push("organization_id = ?");
    params.push(filters.organizationId);
  }

  if (filters.status) {
    clauses.push("status = ?");
    params.push(filters.status);
  }

  const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  return db
    .prepare(`SELECT * FROM inv_lot ${whereClause} ORDER BY updated_at DESC LIMIT 500`)
    .all(...params);
}

export function consumeInventoryLot(
  lotId: string,
  input: { quantity: number; reason?: string },
  actor?: EventActor
) {
  const lot = getLotRow(lotId);
  if (lot.status !== "Active" && lot.status !== "Hold" && lot.status !== "Expired") {
    throw new HttpError(409, "invalid_state", "Lot cannot be consumed in its current status");
  }

  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    throw new HttpError(400, "invalid_request", "Lot consume quantity must be greater than zero");
  }

  if (input.quantity > lot.quantity_on_hand) {
    throw new HttpError(409, "insufficient_lot_quantity", "Lot consume quantity exceeds available lot quantity");
  }

  const timestamp = now();
  const quantityAfter = roundMoney(lot.quantity_on_hand - input.quantity);
  const statusAfter: LotStatus = quantityAfter === 0 ? "Consumed" : lot.status;

  transaction(() => {
    db.prepare(
      `UPDATE inv_lot
       SET quantity_on_hand = ?, status = ?, updated_at = ?
       WHERE lot_id = ?`
    ).run(quantityAfter, statusAfter, timestamp, lotId);

    appendEvent({
      entityId: lotId,
      entityType: "InventoryLot",
      eventType: "inv.lot.consumed",
      version: 1,
      actor,
      governance: { riskLevel: "Low", requiredTier: 1, governanceTag: "INV.Lot.Consume" },
      payload: {
        lotId,
        skuId: lot.sku_id,
        organizationId: lot.organization_id,
        quantityConsumed: input.quantity,
        quantityAfter,
        reason: input.reason
      }
    });
  });

  return getInventoryLotById(lotId);
}

export function createInventorySerial(input: {
  skuId: string;
  organizationId: string;
  serialNumber: string;
  lotId?: string;
}, actor?: EventActor) {
  getSkuRow(input.skuId);
  ensureOrganizationExists(input.organizationId);

  if (input.lotId) {
    const lot = getLotRow(input.lotId);
    if (lot.organization_id !== input.organizationId || lot.sku_id !== input.skuId) {
      throw new HttpError(400, "invalid_request", "lotId does not belong to the provided SKU and organization");
    }
  }

  const serialId = newId("SER-");
  const timestamp = now();

  try {
    transaction(() => {
      db.prepare(
        `INSERT INTO inv_serial(
          serial_id, sku_id, organization_id, lot_id, serial_number, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'Available', ?, ?)`
      ).run(
        serialId,
        input.skuId,
        input.organizationId,
        input.lotId ?? null,
        input.serialNumber,
        timestamp,
        timestamp
      );

      appendEvent({
        entityId: serialId,
        entityType: "InventorySerial",
        eventType: "inv.serial.created",
        version: 1,
        actor,
        governance: { riskLevel: "Low", requiredTier: 1, governanceTag: "INV.Serial.Create" },
        payload: {
          serialId,
          skuId: input.skuId,
          organizationId: input.organizationId,
          serialNumber: input.serialNumber,
          lotId: input.lotId
        }
      });
    });
  } catch (err: unknown) {
    const sqlError = err as { code?: string };
    if (sqlError.code === "SQLITE_CONSTRAINT_UNIQUE") {
      throw new HttpError(409, "duplicate_serial_number", `Serial number '${input.serialNumber}' already exists in this organization`);
    }

    throw err;
  }

  return getInventorySerialById(serialId);
}

export function getInventorySerialById(serialId: string) {
  return getSerialRow(serialId);
}

export function listInventorySerials(filters: {
  skuId?: string;
  organizationId?: string;
  lotId?: string;
  status?: SerialStatus;
} = {}) {
  const clauses: string[] = [];
  const params: string[] = [];

  if (filters.skuId) {
    clauses.push("sku_id = ?");
    params.push(filters.skuId);
  }

  if (filters.organizationId) {
    clauses.push("organization_id = ?");
    params.push(filters.organizationId);
  }

  if (filters.lotId) {
    clauses.push("lot_id = ?");
    params.push(filters.lotId);
  }

  if (filters.status) {
    clauses.push("status = ?");
    params.push(filters.status);
  }

  const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  return db
    .prepare(`SELECT * FROM inv_serial ${whereClause} ORDER BY updated_at DESC LIMIT 500`)
    .all(...params);
}

export function consumeInventorySerial(
  serialId: string,
  input: { reason?: string },
  actor?: EventActor
) {
  const serial = getSerialRow(serialId);
  if (serial.status !== "Available" && serial.status !== "Allocated") {
    throw new HttpError(409, "invalid_state", "Serial cannot be consumed in its current status");
  }

  const timestamp = now();

  transaction(() => {
    db.prepare(
      `UPDATE inv_serial
       SET status = 'Consumed', updated_at = ?
       WHERE serial_id = ?`
    ).run(timestamp, serialId);

    if (serial.lot_id) {
      const lot = getLotRow(serial.lot_id);
      if (lot.quantity_on_hand < 1) {
        throw new HttpError(409, "insufficient_lot_quantity", "Linked lot has no available quantity for serial consumption");
      }

      const lotQuantityAfter = roundMoney(lot.quantity_on_hand - 1);
      const lotStatusAfter: LotStatus = lotQuantityAfter === 0 ? "Consumed" : lot.status;
      db.prepare(
        `UPDATE inv_lot
         SET quantity_on_hand = ?, status = ?, updated_at = ?
         WHERE lot_id = ?`
      ).run(lotQuantityAfter, lotStatusAfter, timestamp, lot.lot_id);
    }

    appendEvent({
      entityId: serialId,
      entityType: "InventorySerial",
      eventType: "inv.serial.consumed",
      version: 1,
      actor,
      governance: { riskLevel: "Low", requiredTier: 1, governanceTag: "INV.Serial.Consume" },
      payload: {
        serialId,
        skuId: serial.sku_id,
        organizationId: serial.organization_id,
        lotId: serial.lot_id,
        reason: input.reason
      }
    });
  });

  return getInventorySerialById(serialId);
}
