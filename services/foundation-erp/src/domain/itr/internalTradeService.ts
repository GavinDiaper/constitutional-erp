/**
 * Internal Trade Service - Internal PO/SO aggregate
 * Handles internal purchase orders and sales orders for inter-departmental transfers
 */

import { db, transaction } from "../../db/connection";
import { appendEvent, EventActor } from "../../events/eventStore";
import { HttpError } from "../../utils/errors";
import { newId } from "../../utils/id";

function now(): string {
  return new Date().toISOString();
}

interface InternalTradeRow {
  trade_id: string;
  organization_id: string;
  trade_type: "InternalPO" | "InternalSO";
  trade_number: string;
  trade_date: string;
  from_department: string;
  to_department: string;
  project_id: string | null;
  total_amount: number;
  total_line_count: number;
  status: "Draft" | "Released" | "Fulfilled" | "Closed";
  approval_status: "Pending" | "Approved" | "Rejected";
  approved_by: string | null;
  approved_at: string | null;
  transfer_pricing_method: "StandardCost" | "ActualCost" | "MarkupPercentage";
  transfer_pricing_value: number;
  created_by: string;
  created_at: string;
  version: number;
}

export interface InternalTradeProjection {
  tradeId: string;
  organizationId: string;
  tradeType: "InternalPO" | "InternalSO";
  tradeNumber: string;
  tradeDate: string;
  fromDepartment: string;
  toDepartment: string;
  projectId?: string;
  totalAmount: number;
  totalLineCount: number;
  status: "Draft" | "Released" | "Fulfilled" | "Closed";
  approvalStatus: "Pending" | "Approved" | "Rejected";
  approvedBy?: string;
  approvedAt?: string;
  transferPricingMethod: "StandardCost" | "ActualCost" | "MarkupPercentage";
  transferPricingValue: number;
  createdBy: string;
  createdAt: string;
  version: number;
}

export function createInternalTrade(
  input: {
    organizationId: string;
    tradeType: "InternalPO" | "InternalSO";
    tradeNumber: string;
    tradeDate: string;
    fromDepartment: string;
    toDepartment: string;
    projectId?: string;
    transferPricingMethod?: "StandardCost" | "ActualCost" | "MarkupPercentage";
    transferPricingValue?: number;
  },
  actor?: EventActor
): InternalTradeProjection {
  const tradeId = newId("ITR-");
  const timestamp = now();

  try {
    transaction(() => {
      db.prepare(
        `INSERT INTO itr_internal_trade(
          trade_id, organization_id, trade_type, trade_number, trade_date,
          from_department, to_department, project_id,
          total_amount, total_line_count,
          status, approval_status,
          transfer_pricing_method, transfer_pricing_value,
          created_by, created_at, version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        tradeId,
        input.organizationId,
        input.tradeType,
        input.tradeNumber,
        input.tradeDate,
        input.fromDepartment,
        input.toDepartment,
        input.projectId ?? null,
        0,
        0,
        "Draft",
        "Pending",
        input.transferPricingMethod ?? "StandardCost",
        input.transferPricingValue ?? 0,
        actor?.id ?? "system",
        timestamp,
        1
      );

      appendEvent({
        entityId: tradeId,
        entityType: "internal_trade",
        eventType: "itr.internal_trade_created",
        version: 1,
        actor,
        payload: {
          tradeId,
          organizationId: input.organizationId,
          tradeType: input.tradeType,
          tradeNumber: input.tradeNumber,
          projectId: input.projectId,
        } as unknown as Record<string, unknown>,
      });
    });
  } catch (err: unknown) {
    const sqlError = err as { code?: string };
    if (sqlError.code === "SQLITE_CONSTRAINT_UNIQUE") {
      throw new HttpError(409, "duplicate", "Internal trade number already exists");
    }
    throw err;
  }

  return getInternalTradeById(tradeId) as InternalTradeProjection;
}

export function releaseInternalTrade(tradeId: string, actor?: EventActor): InternalTradeProjection {
  const trade = getInternalTradeById(tradeId);
  if (!trade) {
    throw new HttpError(404, "not_found", "Internal trade not found");
  }
  if (trade.status !== "Draft") {
    throw new HttpError(400, "invalid_state", "Trade must be in Draft status to release");
  }

  const timestamp = now();
  transaction(() => {
    db.prepare("UPDATE itr_internal_trade SET status = ?, version = version + 1 WHERE trade_id = ?").run(
      "Released",
      tradeId
    );

    appendEvent({
      entityId: tradeId,
      entityType: "internal_trade",
      eventType: "itr.internal_trade_released",
      version: trade.version + 1,
      actor,
      payload: {
        tradeId,
        releasedAt: timestamp,
      } as unknown as Record<string, unknown>,
    });
  });

  return getInternalTradeById(tradeId) as InternalTradeProjection;
}

export function approveInternalTrade(tradeId: string, actor?: EventActor): InternalTradeProjection {
  const trade = getInternalTradeById(tradeId);
  if (!trade) {
    throw new HttpError(404, "not_found", "Internal trade not found");
  }
  if (trade.status !== "Released") {
    throw new HttpError(400, "invalid_state", "Trade must be Released to approve");
  }

  const timestamp = now();
  transaction(() => {
    db.prepare(
      `UPDATE itr_internal_trade SET approval_status = ?, approved_by = ?, approved_at = ?, version = version + 1 
       WHERE trade_id = ?`
    ).run("Approved", actor?.id ?? "system", timestamp, tradeId);

    appendEvent({
      entityId: tradeId,
      entityType: "internal_trade",
      eventType: "itr.internal_trade_approved",
      version: trade.version + 1,
      actor,
      governance: {
        riskLevel: "Low",
        requiredTier: 1,
      },
      payload: {
        tradeId,
        approvedAt: timestamp,
        totalAmount: trade.totalAmount,
      } as unknown as Record<string, unknown>,
    });
  });

  return getInternalTradeById(tradeId) as InternalTradeProjection;
}

export function getInternalTradeById(tradeId: string): InternalTradeProjection | null {
  const row = db
    .prepare("SELECT * FROM itr_internal_trade WHERE trade_id = ?")
    .get(tradeId) as InternalTradeRow | undefined;

  if (!row) {
    return null;
  }

  return {
    tradeId: row.trade_id,
    organizationId: row.organization_id,
    tradeType: row.trade_type,
    tradeNumber: row.trade_number,
    tradeDate: row.trade_date,
    fromDepartment: row.from_department,
    toDepartment: row.to_department,
    projectId: row.project_id ?? undefined,
    totalAmount: row.total_amount,
    totalLineCount: row.total_line_count,
    status: row.status,
    approvalStatus: row.approval_status,
    approvedBy: row.approved_by ?? undefined,
    approvedAt: row.approved_at ?? undefined,
    transferPricingMethod: row.transfer_pricing_method,
    transferPricingValue: row.transfer_pricing_value,
    createdBy: row.created_by,
    createdAt: row.created_at,
    version: row.version,
  };
}

export function listInternalTrades(organizationId: string, limit = 100, offset = 0) {
  const rows = db
    .prepare(
      "SELECT * FROM itr_internal_trade WHERE organization_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?"
    )
    .all(organizationId, limit, offset) as InternalTradeRow[];

  return rows.map((row) => ({
    tradeId: row.trade_id,
    organizationId: row.organization_id,
    tradeType: row.trade_type,
    tradeNumber: row.trade_number,
    tradeDate: row.trade_date,
    fromDepartment: row.from_department,
    toDepartment: row.to_department,
    projectId: row.project_id ?? undefined,
    totalAmount: row.total_amount,
    totalLineCount: row.total_line_count,
    status: row.status,
    approvalStatus: row.approval_status,
    approvedBy: row.approved_by ?? undefined,
    approvedAt: row.approved_at ?? undefined,
    transferPricingMethod: row.transfer_pricing_method,
    transferPricingValue: row.transfer_pricing_value,
    createdBy: row.created_by,
    createdAt: row.created_at,
    version: row.version,
  }));
}
