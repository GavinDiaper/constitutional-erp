import { db, transaction } from "../../../db/connection";
import { appendEvent, EventActor } from "../../../events/eventStore";
import { newId } from "../../../utils/id";
import { HttpError } from "../../../utils/errors";
import { ensureLegalEntityExists } from "../../r2r/legalEntity/legalEntityService";
import { assertApprovedContractVersion } from "../contract/contractService";

type SalesOrderState = "Draft" | "Confirmed" | "Allocated" | "Shipped" | "Invoiced" | "Paid" | "Closed" | "Cancelled";

const transitions: Record<SalesOrderState, SalesOrderState[]> = {
  Draft: ["Confirmed", "Cancelled"],
  Confirmed: ["Allocated", "Cancelled"],
  Allocated: ["Shipped", "Cancelled"],
  Shipped: ["Invoiced", "Cancelled"],
  Invoiced: ["Paid"],
  Paid: ["Closed"],
  Closed: [],
  Cancelled: []
};

function now(): string {
  return new Date().toISOString();
}

function ensureProjectExists(projectId: string): void {
  const row = db.prepare("SELECT project_id FROM proj_project WHERE project_id = ?").get(projectId) as
    | { project_id: string }
    | undefined;

  if (!row) {
    throw new HttpError(404, "not_found", "Project not found");
  }
}

export function getOrderById(orderId: string) {
  const row = db.prepare("SELECT * FROM o2c_sales_order WHERE order_id = ?").get(orderId) as
    | {
        order_id: string;
        state: SalesOrderState;
        customer_id: string;
        quote_id: string | null;
        project_id: string | null;
        wbs_id: string | null;
        contract_version_id: string | null;
        created_at: string;
        legal_entity_id: string | null;
        version: number;
      }
    | undefined;

  if (!row) {
    throw new HttpError(404, "not_found", "Sales order not found");
  }

  return row;
}

export function listOrders() {
  return db.prepare("SELECT * FROM o2c_sales_order ORDER BY created_at DESC LIMIT 100").all();
}

export function listOrderLines(orderId: string) {
  getOrderById(orderId);
  return db
    .prepare(
      `SELECT
         order_line_id,
         order_id,
         sku,
         quantity,
         unit_price,
         line_total,
         project_id,
         wbs_id,
         contract_version_id,
         wbs_element_id,
         (SELECT sku_id FROM inv_sku WHERE sku_id = o2c_sales_order_line.sku OR sku_code = o2c_sales_order_line.sku) AS sku_id,
         COALESCE((SELECT sku_type FROM inv_sku WHERE sku_id = o2c_sales_order_line.sku OR sku_code = o2c_sales_order_line.sku), 'physical') AS sku_type,
         tax_code_id,
         tax_applicability,
         tax_rate_percent,
         tax_amount,
         created_at
       FROM o2c_sales_order_line
       WHERE order_id = ?
       ORDER BY created_at ASC`
    )
    .all(orderId);
}

function assertTransition(fromState: SalesOrderState, toState: SalesOrderState) {
  if (!transitions[fromState].includes(toState)) {
    throw new HttpError(409, "invalid_transition", `Cannot transition order from ${fromState} to ${toState}`);
  }
}

function isServiceSku(sku: string): boolean {
  return Boolean(db.prepare("SELECT sku_id FROM inv_sku WHERE (sku_id = ? OR sku_code = ?) AND sku_type = 'service'")
    .get(sku, sku));
}

function getProjectContract(projectId: string) {
  return db.prepare(
    "SELECT project_id, customer_id, project_type, contract_version_id, status FROM proj_project WHERE project_id = ?"
  ).get(projectId) as {
    project_id: string;
    customer_id: string | null;
    project_type: string;
    contract_version_id: string | null;
    status: string;
  } | undefined;
}

export function createOrderFromQuote(
  quoteId: string,
  legalEntityId?: string,
  projectId?: string,
  wbsId?: string,
  contractVersionId?: string
) {
  const quote = db.prepare("SELECT * FROM o2c_quote WHERE quote_id = ?").get(quoteId) as
    | {
        quote_id: string;
        customer_id: string;
        state: string;
        currency_code: string;
        total_amount: number;
        project_id: string | null;
        legal_entity_id: string | null;
        version: number;
      }
    | undefined;

  if (!quote) {
    throw new HttpError(404, "not_found", "Quote not found");
  }

  if (quote.state !== "Accepted") {
    throw new HttpError(409, "invalid_transition", "Quote must be Accepted before conversion");
  }

  const effectiveLegalEntityId = legalEntityId ?? quote.legal_entity_id ?? null;

  if (effectiveLegalEntityId) {
    ensureLegalEntityExists(effectiveLegalEntityId);
  }

  const effectiveProjectId = projectId ?? quote.project_id ?? null;

  if (effectiveProjectId) {
    ensureProjectExists(effectiveProjectId);
  }

  const quoteLines = db.prepare("SELECT * FROM o2c_quote_line WHERE quote_id = ?").all(quoteId) as Array<{
    quote_line_id: string;
    sku: string;
    quantity: number;
    unit_price: number;
    line_total: number;
    tax_code_id: string | null;
    tax_applicability: string | null;
    tax_rate_percent: number | null;
    tax_amount: number;
  }>;

  const hasServiceLines = quoteLines.some((line) => isServiceSku(line.sku));
  if (hasServiceLines && !contractVersionId) {
    throw new HttpError(409, "contract_required", "Service SKU quote lines require an approved contract version to convert");
  }
  if (contractVersionId) {
    assertApprovedContractVersion(contractVersionId, quote.customer_id, now().slice(0, 10));
  }
  if (effectiveProjectId && contractVersionId) {
    const project = getProjectContract(effectiveProjectId);
    if (!project || project.project_type !== "Service" || project.customer_id !== quote.customer_id || project.contract_version_id !== contractVersionId) {
      throw new HttpError(409, "project_contract_mismatch", "Project must be a Service project for the quote customer and selected contract version");
    }
  }

  const orderId = newId("SO-");
  const timestamp = now();

  transaction(() => {
    db.prepare(
      `INSERT INTO o2c_sales_order(order_id, quote_id, customer_id, project_id, wbs_id, contract_version_id, legal_entity_id, state, currency_code, total_amount, version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'Draft', ?, ?, 1, ?, ?)`
    ).run(
      orderId,
      quoteId,
      quote.customer_id,
      effectiveProjectId,
      wbsId ?? null,
      contractVersionId ?? null,
      effectiveLegalEntityId,
      quote.currency_code,
      quote.total_amount,
      timestamp,
      timestamp
    );

    const insertLine = db.prepare(
      `INSERT INTO o2c_sales_order_line(
         order_line_id,
         order_id,
         sku,
         quantity,
         unit_price,
         line_total,
         project_id,
         wbs_id,
         contract_version_id,
         tax_code_id,
         tax_applicability,
         tax_rate_percent,
         tax_amount,
         created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    for (const line of quoteLines) {
      insertLine.run(
        newId("SOL-"),
        orderId,
        line.sku,
        line.quantity,
        line.unit_price,
        line.line_total,
        effectiveProjectId,
        wbsId ?? null,
        isServiceSku(line.sku) ? contractVersionId ?? null : null,
        line.tax_code_id,
        line.tax_applicability,
        line.tax_rate_percent,
        line.tax_amount ?? 0,
        timestamp
      );
    }

    db.prepare("UPDATE o2c_quote SET state = 'ConvertedToOrder', version = version + 1, updated_at = ? WHERE quote_id = ?")
      .run(timestamp, quoteId);

    appendEvent({
      entityId: quoteId,
      entityType: "Quote",
      eventType: "QuoteConvertedToOrder",
      version: quote.version + 1,
      payload: { orderId }
    });

    appendEvent({
      entityId: orderId,
      entityType: "SalesOrder",
      eventType: "order.created",
      version: 1,
      payload: {
        quoteId,
        customerId: quote.customer_id,
        projectId: effectiveProjectId,
        wbsId: wbsId ?? null,
        contractVersionId: contractVersionId ?? null,
        legalEntityId: effectiveLegalEntityId
      }
    });
  });

  return getOrderById(orderId);
}

export function assignOrderLineWbs(orderId: string, orderLineId: string, projectId: string, wbsElementId: string, actor?: EventActor) {
  const order = getOrderById(orderId);
  if (order.state !== "Draft") {
    throw new HttpError(409, "invalid_transition", "WBS mappings can only be changed while the order is Draft");
  }
  if (!order.contract_version_id) {
    throw new HttpError(409, "contract_required", "Sales order has no contract version");
  }
  assertApprovedContractVersion(order.contract_version_id, order.customer_id, order.created_at.slice(0, 10), true);

  const line = db.prepare(
    "SELECT order_line_id, sku FROM o2c_sales_order_line WHERE order_id = ? AND order_line_id = ?"
  ).get(orderId, orderLineId) as { order_line_id: string; sku: string } | undefined;
  if (!line) {
    throw new HttpError(404, "not_found", "Sales order line not found");
  }
  if (!isServiceSku(line.sku)) {
    throw new HttpError(400, "invalid_request", "Only service SKU lines can be mapped to project WBS elements");
  }

  const project = getProjectContract(projectId);
  if (!project) {
    throw new HttpError(404, "not_found", "Project not found");
  }
  if (project.project_type !== "Service" || project.customer_id !== order.customer_id || project.contract_version_id !== order.contract_version_id) {
    throw new HttpError(409, "project_contract_mismatch", "Project must match the order customer and contract version");
  }
  if (["Completed", "Cancelled"].includes(project.status)) {
    throw new HttpError(409, "invalid_transition", `Cannot map an order line to a ${project.status} project`);
  }

  const wbs = db.prepare(
    `SELECT wbs_element_id, project_id, contract_version_id, wbs_code, deliverable_sku_id
     FROM proj_wbs_element WHERE wbs_element_id = ? AND project_id = ?`
  ).get(wbsElementId, projectId) as {
    wbs_element_id: string;
    project_id: string;
    contract_version_id: string | null;
    wbs_code: string;
    deliverable_sku_id: string | null;
  } | undefined;
  if (!wbs) {
    throw new HttpError(404, "not_found", "WBS element not found for project");
  }
  if (wbs.contract_version_id !== order.contract_version_id) {
    throw new HttpError(409, "wbs_contract_mismatch", "WBS element does not belong to the order contract version");
  }
  const lineSku = db.prepare("SELECT sku_id FROM inv_sku WHERE sku_id = ? OR sku_code = ?")
    .get(line.sku, line.sku) as { sku_id: string } | undefined;
  if (wbs.deliverable_sku_id && wbs.deliverable_sku_id !== lineSku?.sku_id) {
    throw new HttpError(409, "wbs_deliverable_mismatch", "WBS deliverable SKU does not match the sales order line");
  }

  const timestamp = now();
  const nextVersion = order.version + 1;
  try {
    transaction(() => {
      db.prepare(
        `UPDATE o2c_sales_order_line
         SET project_id = ?, wbs_id = ?, wbs_element_id = ?, contract_version_id = ?
         WHERE order_id = ? AND order_line_id = ?`
      ).run(projectId, wbs.wbs_code, wbsElementId, order.contract_version_id, orderId, orderLineId);
      db.prepare("UPDATE o2c_sales_order SET version = ?, updated_at = ? WHERE order_id = ?")
        .run(nextVersion, timestamp, orderId);
      appendEvent({
        entityId: orderId,
        entityType: "SalesOrder",
        eventType: "order.line_wbs_assigned",
        version: nextVersion,
        actor,
        payload: { orderLineId, projectId, contractVersionId: order.contract_version_id, wbsElementId }
      });
    });
  } catch (error) {
    if ((error as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE") {
      throw new HttpError(409, "wbs_element_already_mapped", "A WBS element can be mapped to only one sales order line");
    }
    throw error;
  }
  return db.prepare(
    `SELECT order_line_id AS orderLineId, order_id AS orderId, project_id AS projectId,
            contract_version_id AS contractVersionId, wbs_id AS wbsId,
            wbs_element_id AS wbsElementId
     FROM o2c_sales_order_line WHERE order_line_id = ?`
  ).get(orderLineId);
}

export function assignOrderProject(orderId: string, projectId: string, wbsId?: string | null, actor?: EventActor) {
  const order = getOrderById(orderId);

  if (["Invoiced", "Paid", "Closed", "Cancelled"].includes(order.state)) {
    throw new HttpError(409, "invalid_transition", `Cannot change project for order in ${order.state} state`);
  }

  ensureProjectExists(projectId);

  const nextVersion = order.version + 1;
  const timestamp = now();

  transaction(() => {
    db.prepare("UPDATE o2c_sales_order SET project_id = ?, wbs_id = ?, version = ?, updated_at = ? WHERE order_id = ?")
      .run(projectId, wbsId ?? null, nextVersion, timestamp, orderId);

    appendEvent({
      entityId: orderId,
      entityType: "SalesOrder",
      eventType: "order.project_assigned",
      version: nextVersion,
      actor,
      payload: {
        fromProjectId: order.project_id ?? null,
        fromWbsId: order.wbs_id ?? null,
        toProjectId: projectId,
        toWbsId: wbsId ?? null
      }
    });
  });

  return getOrderById(orderId);
}

export function updateOrderState(orderId: string, toState: SalesOrderState, actor?: EventActor) {
  return _doOrderTransition(orderId, toState, actor);
}

function _doOrderTransition(orderId: string, toState: SalesOrderState, actor?: EventActor) {
  const order = getOrderById(orderId);
  assertTransition(order.state, toState);

  const nextVersion = order.version + 1;
  const timestamp = now();

  transaction(() => {
    db.prepare("UPDATE o2c_sales_order SET state = ?, version = ?, updated_at = ? WHERE order_id = ?")
      .run(toState, nextVersion, timestamp, orderId);

    appendEvent({
      entityId: orderId,
      entityType: "SalesOrder",
      eventType: `order.${toState.toLowerCase()}`,
      version: nextVersion,
      actor,
      payload: { from: order.state, to: toState }
    });
  });

  return getOrderById(orderId);
}

export function confirmOrder(orderId: string, actor?: EventActor) {
  const order = getOrderById(orderId);
  const lines = db.prepare(
    `SELECT l.order_line_id, l.sku, l.project_id, l.contract_version_id, l.wbs_element_id,
            s.sku_type
     FROM o2c_sales_order_line l
     LEFT JOIN inv_sku s ON s.sku_id = l.sku OR s.sku_code = l.sku
     WHERE l.order_id = ?`
  ).all(orderId) as Array<{
    order_line_id: string;
    sku: string;
    project_id: string | null;
    contract_version_id: string | null;
    wbs_element_id: string | null;
    sku_type: string | null;
  }>;
  const serviceLines = lines.filter((line) => line.sku_type === "service");
  if (serviceLines.length > 0) {
    if (!order.contract_version_id) {
      throw new HttpError(409, "contract_required", "Service order lines require an approved contract version");
    }
    assertApprovedContractVersion(order.contract_version_id, order.customer_id, order.created_at.slice(0, 10), true);
    const unmapped = serviceLines.find((line) =>
      !line.project_id || !line.wbs_element_id || line.contract_version_id !== order.contract_version_id
    );
    if (unmapped) {
      throw new HttpError(409, "service_line_unmapped", `Service order line '${unmapped.order_line_id}' requires a project and WBS mapping`);
    }
    for (const line of serviceLines) {
      const mapping = db.prepare(
        `SELECT p.customer_id, p.project_type, p.contract_version_id AS project_contract_version_id,
                w.contract_version_id AS wbs_contract_version_id
         FROM proj_project p
         JOIN proj_wbs_element w ON w.project_id = p.project_id
         WHERE p.project_id = ? AND w.wbs_element_id = ?`
      ).get(line.project_id, line.wbs_element_id) as {
        customer_id: string | null;
        project_type: string;
        project_contract_version_id: string | null;
        wbs_contract_version_id: string | null;
      } | undefined;
      if (!mapping || mapping.customer_id !== order.customer_id || mapping.project_type !== "Service" ||
          mapping.project_contract_version_id !== order.contract_version_id ||
          mapping.wbs_contract_version_id !== order.contract_version_id) {
        throw new HttpError(409, "service_line_mapping_invalid", `Service order line '${line.order_line_id}' has an invalid project/WBS mapping`);
      }
    }
  }
  return _doOrderTransition(orderId, "Confirmed", actor);
}

export function allocateOrder(orderId: string, actor?: EventActor) {
  return _doOrderTransition(orderId, "Allocated", actor);
}

export function shipOrder(orderId: string, actor?: EventActor) {
  const order = getOrderById(orderId);
  assertTransition(order.state, "Shipped");

  const nextVersion = order.version + 1;
  const timestamp = now();

  transaction(() => {
    db.prepare("UPDATE o2c_sales_order SET state = ?, version = ?, updated_at = ? WHERE order_id = ?")
      .run("Shipped", nextVersion, timestamp, orderId);

    appendEvent({
      entityId: orderId,
      entityType: "SalesOrder",
      eventType: "order.shipped",
      version: nextVersion,
      actor,
      payload: { from: order.state, to: "Shipped" }
    });

    const shipmentId = newId("SHIP-");
    db.prepare(
      `INSERT INTO o2c_shipment(shipment_id, order_id, state, ship_date, version, created_at, updated_at)
       VALUES (?, ?, 'Shipped', ?, 2, ?, ?)`
    ).run(shipmentId, orderId, timestamp, timestamp, timestamp);

    appendEvent({
      entityId: shipmentId,
      entityType: "Shipment",
      eventType: "shipment.created",
      version: 1,
      actor,
      payload: { orderId }
    });

    appendEvent({
      entityId: shipmentId,
      entityType: "Shipment",
      eventType: "shipment.shipped",
      version: 2,
      actor,
      payload: { from: "Planned", to: "Shipped" }
    });
  });

  return getOrderById(orderId);
}

export function closeOrder(orderId: string, actor?: EventActor) {
  return _doOrderTransition(orderId, "Closed", actor);
}

export function cancelOrder(orderId: string, actor?: EventActor) {
  return _doOrderTransition(orderId, "Cancelled", actor);
}
