import { db, transaction } from "../../../db/connection";
import { appendEvent } from "../../../events/eventStore";
import { newId } from "../../../utils/id";
import { HttpError } from "../../../utils/errors";

function now(): string {
  return new Date().toISOString();
}

export function createCustomer(input: { customerName: string; email?: string }) {
  const customerId = newId("CUST-");
  const timestamp = now();

  transaction(() => {
    db.prepare(
      `INSERT INTO o2c_customer(customer_id, customer_name, email, status, created_at, updated_at)
       VALUES (?, ?, ?, 'Active', ?, ?)`
    ).run(customerId, input.customerName, input.email ?? null, timestamp, timestamp);

    appendEvent({
      entityId: customerId,
      entityType: "Customer",
      eventType: "CustomerCreated",
      version: 1,
      payload: { customerName: input.customerName, email: input.email ?? null }
    });
  });

  return getCustomerById(customerId);
}

export function listCustomers() {
  return db.prepare("SELECT * FROM o2c_customer ORDER BY created_at DESC LIMIT 100").all();
}

export function getCustomerById(customerId: string) {
  const row = db.prepare("SELECT * FROM o2c_customer WHERE customer_id = ?").get(customerId);
  if (!row) {
    throw new HttpError(404, "not_found", "Customer not found");
  }

  return row;
}

export function ensureCustomerExists(customerId: string) {
  const row = db.prepare("SELECT customer_id FROM o2c_customer WHERE customer_id = ?").get(customerId);
  if (!row) {
    throw new HttpError(404, "not_found", "Customer not found");
  }
}
