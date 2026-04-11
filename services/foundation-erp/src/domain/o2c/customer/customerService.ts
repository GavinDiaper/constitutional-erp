import { db, transaction } from "../../../db/connection";
import { appendEvent, EventActor } from "../../../events/eventStore";
import { newId } from "../../../utils/id";
import { HttpError } from "../../../utils/errors";

type CustomerStatus = "Draft" | "Active" | "Inactive";

function now(): string {
  return new Date().toISOString();
}

export function createCustomer(input: { customerName: string; email?: string; billingAddress?: string; shippingAddress?: string }, actor?: EventActor) {
  const customerId = newId("CUST-");
  const timestamp = now();

  transaction(() => {
    db.prepare(
      `INSERT INTO o2c_customer(customer_id, customer_name, email, status, billing_address, shipping_address, created_at, updated_at)
       VALUES (?, ?, ?, 'Draft', ?, ?, ?, ?)`
    ).run(customerId, input.customerName, input.email ?? null, input.billingAddress ?? null, input.shippingAddress ?? null, timestamp, timestamp);

    appendEvent({
      entityId: customerId,
      entityType: "Customer",
      eventType: "customer.created",
      version: 1,
      actor,
      payload: { customerName: input.customerName, email: input.email ?? null }
    });
  });

  return getCustomerById(customerId);
}

export function activateCustomer(customerId: string, actor?: EventActor) {
  const customer = getCustomerById(customerId) as { customer_id: string; status: CustomerStatus; version?: number };
  if (customer.status !== "Draft") {
    throw new HttpError(409, "invalid_transition", `Cannot activate customer in state ${customer.status}`);
  }
  const timestamp = now();
  const nextVersion = ((customer as any).version ?? 1) + 1;

  transaction(() => {
    db.prepare("UPDATE o2c_customer SET status = 'Active', updated_at = ? WHERE customer_id = ?")
      .run(timestamp, customerId);

    appendEvent({
      entityId: customerId,
      entityType: "Customer",
      eventType: "customer.activated",
      version: nextVersion,
      actor,
      payload: {}
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
