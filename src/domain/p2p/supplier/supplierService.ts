import { db, transaction } from "../../../db/connection";
import { appendEvent, EventActor } from "../../../events/eventStore";
import { newId } from "../../../utils/id";
import { HttpError } from "../../../utils/errors";

type SupplierStatus = "Draft" | "Active" | "Suspended" | "Inactive";

const statusTransitions: Record<SupplierStatus, SupplierStatus[]> = {
  Draft: ["Active"],
  Active: ["Suspended", "Inactive"],
  Suspended: ["Active", "Inactive"],
  Inactive: []
};

function now(): string {
  return new Date().toISOString();
}

export function createSupplier(
  input: { supplierName: string; email?: string; paymentTerms?: string; taxId?: string; currencyCode?: string },
  actor?: EventActor
) {
  const supplierId = newId("SUP-");
  const timestamp = now();

  transaction(() => {
    db.prepare(
      `INSERT INTO p2p_supplier(supplier_id, supplier_name, email, status, payment_terms, tax_id, currency_code, created_at, updated_at)
       VALUES (?, ?, ?, 'Draft', ?, ?, ?, ?, ?)`
    ).run(
      supplierId,
      input.supplierName,
      input.email ?? null,
      input.paymentTerms ?? null,
      input.taxId ?? null,
      input.currencyCode ?? null,
      timestamp,
      timestamp
    );

    appendEvent({
      entityId: supplierId,
      entityType: "Supplier",
      eventType: "supplier.created",
      version: 1,
      payload: {
        supplierName: input.supplierName,
        email: input.email ?? null,
        paymentTerms: input.paymentTerms ?? null,
        taxId: input.taxId ?? null,
        currencyCode: input.currencyCode ?? null
      },
      actor
    });
  });

  return getSupplierById(supplierId);
}

export function listSuppliers() {
  return db.prepare("SELECT * FROM p2p_supplier ORDER BY created_at DESC LIMIT 100").all();
}

export function getSupplierById(supplierId: string) {
  const row = db.prepare("SELECT * FROM p2p_supplier WHERE supplier_id = ?").get(supplierId);
  if (!row) {
    throw new HttpError(404, "not_found", "Supplier not found");
  }
  return row;
}

function updateSupplierStatus(supplierId: string, toStatus: SupplierStatus, eventType: string, actor?: EventActor) {
  const supplier = db.prepare("SELECT * FROM p2p_supplier WHERE supplier_id = ?").get(supplierId) as
    | { supplier_id: string; status: SupplierStatus; version?: number }
    | undefined;

  if (!supplier) {
    throw new HttpError(404, "not_found", "Supplier not found");
  }

  const fromStatus = supplier.status;
  if (!statusTransitions[fromStatus].includes(toStatus)) {
    throw new HttpError(409, "invalid_transition", `Cannot transition supplier from ${fromStatus} to ${toStatus}`);
  }

  const timestamp = now();
  transaction(() => {
    db.prepare("UPDATE p2p_supplier SET status = ?, updated_at = ? WHERE supplier_id = ?")
      .run(toStatus, timestamp, supplierId);

    appendEvent({
      entityId: supplierId,
      entityType: "Supplier",
      eventType,
      version: 1,
      payload: { from: fromStatus, to: toStatus },
      actor
    });
  });

  return getSupplierById(supplierId);
}

export function activateSupplier(supplierId: string, actor?: EventActor) {
  return updateSupplierStatus(supplierId, "Active", "supplier.activated", actor);
}

export function suspendSupplier(supplierId: string, actor?: EventActor) {
  return updateSupplierStatus(supplierId, "Suspended", "supplier.suspended", actor);
}

export function deactivateSupplier(supplierId: string, actor?: EventActor) {
  return updateSupplierStatus(supplierId, "Inactive", "supplier.deactivated", actor);
}

export function ensureSupplierExists(supplierId: string) {
  const row = db.prepare("SELECT supplier_id FROM p2p_supplier WHERE supplier_id = ?").get(supplierId);
  if (!row) {
    throw new HttpError(404, "not_found", "Supplier not found");
  }
}
