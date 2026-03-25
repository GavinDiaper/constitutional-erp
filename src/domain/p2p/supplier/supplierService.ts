import { db, transaction } from "../../../db/connection";
import { appendEvent } from "../../../events/eventStore";
import { newId } from "../../../utils/id";
import { HttpError } from "../../../utils/errors";

function now(): string {
  return new Date().toISOString();
}

export function createSupplier(input: { supplierName: string; email?: string }) {
  const supplierId = newId("SUP-");
  const timestamp = now();

  transaction(() => {
    db.prepare(
      `INSERT INTO p2p_supplier(supplier_id, supplier_name, email, status, created_at, updated_at)
       VALUES (?, ?, ?, 'Active', ?, ?)`
    ).run(supplierId, input.supplierName, input.email ?? null, timestamp, timestamp);

    appendEvent({
      entityId: supplierId,
      entityType: "Supplier",
      eventType: "SupplierCreated",
      version: 1,
      payload: { supplierName: input.supplierName, email: input.email ?? null }
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

export function ensureSupplierExists(supplierId: string) {
  const row = db.prepare("SELECT supplier_id FROM p2p_supplier WHERE supplier_id = ?").get(supplierId);
  if (!row) {
    throw new HttpError(404, "not_found", "Supplier not found");
  }
}
