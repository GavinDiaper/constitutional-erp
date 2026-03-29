import { Router } from "express";
import { z } from "zod";
import { validateBody } from "../../middleware/validate";
import { entityWithLinks } from "../../utils/hypermedia";
import {
  createCustomer,
  getCustomerById,
  listCustomers,
  activateCustomer
} from "../../domain/o2c/customer/customerService";
import {
  addQuoteLine,
  createQuote,
  getQuoteById,
  listQuotes,
  sendQuote,
  acceptQuote,
  rejectQuote,
  expireQuote,
  convertQuoteToOrder
} from "../../domain/o2c/quote/quoteService";
import {
  createOrderFromQuote,
  getOrderById,
  listOrders,
  confirmOrder,
  allocateOrder,
  shipOrder,
  closeOrder,
  cancelOrder
} from "../../domain/o2c/order/salesOrderService";
import {
  generateInvoice,
  getInvoiceById,
  listInvoices,
  postARInvoice,
  cancelARInvoice
} from "../../domain/o2c/invoice/invoiceService";
import {
  getPaymentById,
  listPayments,
  registerPayment,
  applyARPayment,
  reconcileARPayment,
  cancelARPayment
} from "../../domain/o2c/payment/paymentService";
import {
  createShipment,
  getShipmentById,
  listShipments,
  shipOrder as executeShipment,
  deliverShipment,
  cancelShipment
} from "../../domain/o2c/shipment/shipmentService";

// ── Zod schemas ──────────────────────────────────────────────────────────────

const createCustomerSchema = z.object({
  customerName: z.string().min(1),
  email: z.string().email().optional(),
  billingAddress: z.string().optional(),
  shippingAddress: z.string().optional()
});

const createQuoteSchema = z.object({
  customerId: z.string().min(1),
  currencyCode: z.string().min(3).max(3)
});

const addQuoteLineSchema = z.object({
  sku: z.string().min(1),
  quantity: z.number().positive(),
  unitPrice: z.number().nonnegative()
});

const registerPaymentSchema = z.object({
  invoiceId: z.string().min(1),
  amount: z.number().positive(),
  currencyCode: z.string().min(3).max(3).optional(),
  method: z.string().optional(),
  paymentDate: z.string().optional()
});

const createShipmentSchema = z.object({
  orderId: z.string().min(1)
});

const shipShipmentSchema = z.object({
  carrier: z.string().optional(),
  trackingNumber: z.string().optional()
});

// ── HATEOAS link builders ────────────────────────────────────────────────────

function customerLinks(customerId: string, state: string) {
  const links: Record<string, { href: string; method: "GET" | "POST"; mcpFunction?: string }> = {
    self: { href: `/api/v1/o2c/customers/${customerId}`, method: "GET" }
  };

  if (state === "Draft") {
    links["activate"] = {
      href: `/api/v1/o2c/customers/${customerId}/activate`,
      method: "POST",
      mcpFunction: "o2c_activate_customer"
    };
  }

  return links;
}

function quoteLinks(quoteId: string, state: string) {
  const links: Record<string, { href: string; method: "GET" | "POST"; mcpFunction?: string }> = {
    self: { href: `/api/v1/o2c/quotes/${quoteId}`, method: "GET" }
  };

  if (state === "Draft") {
    links["send"] = {
      href: `/api/v1/o2c/quotes/${quoteId}/send`,
      method: "POST",
      mcpFunction: "o2c_send_quote"
    };
    links["reject"] = {
      href: `/api/v1/o2c/quotes/${quoteId}/reject`,
      method: "POST",
      mcpFunction: "o2c_reject_quote"
    };
  }

  if (state === "Sent") {
    links["accept"] = {
      href: `/api/v1/o2c/quotes/${quoteId}/accept`,
      method: "POST",
      mcpFunction: "o2c_accept_quote"
    };
    links["reject"] = {
      href: `/api/v1/o2c/quotes/${quoteId}/reject`,
      method: "POST",
      mcpFunction: "o2c_reject_quote"
    };
    links["expire"] = {
      href: `/api/v1/o2c/quotes/${quoteId}/expire`,
      method: "POST",
      mcpFunction: "o2c_expire_quote"
    };
  }

  if (state === "Accepted") {
    links["convert-to-order"] = {
      href: `/api/v1/o2c/quotes/${quoteId}/convert`,
      method: "POST",
      mcpFunction: "o2c_convert_quote_to_order"
    };
  }

  return links;
}

function orderLinks(orderId: string, state: string) {
  const links: Record<string, { href: string; method: "GET" | "POST"; mcpFunction?: string }> = {
    self: { href: `/api/v1/o2c/orders/${orderId}`, method: "GET" }
  };

  if (state === "Draft") {
    links["confirm"] = {
      href: `/api/v1/o2c/orders/${orderId}/confirm`,
      method: "POST",
      mcpFunction: "o2c_confirm_order"
    };
    links["cancel"] = {
      href: `/api/v1/o2c/orders/${orderId}/cancel`,
      method: "POST",
      mcpFunction: "o2c_cancel_order"
    };
  }

  if (state === "Confirmed") {
    links["allocate"] = {
      href: `/api/v1/o2c/orders/${orderId}/allocate`,
      method: "POST",
      mcpFunction: "o2c_allocate_order"
    };
    links["cancel"] = {
      href: `/api/v1/o2c/orders/${orderId}/cancel`,
      method: "POST",
      mcpFunction: "o2c_cancel_order"
    };
  }

  if (state === "Allocated") {
    links["ship"] = {
      href: `/api/v1/o2c/orders/${orderId}/ship`,
      method: "POST",
      mcpFunction: "o2c_ship_order"
    };
    links["cancel"] = {
      href: `/api/v1/o2c/orders/${orderId}/cancel`,
      method: "POST",
      mcpFunction: "o2c_cancel_order"
    };
  }

  if (state === "Shipped") {
    links["generate-invoice"] = {
      href: `/api/v1/o2c/orders/${orderId}/generate-invoice`,
      method: "POST",
      mcpFunction: "o2c_generate_invoice"
    };
    links["close"] = {
      href: `/api/v1/o2c/orders/${orderId}/close`,
      method: "POST",
      mcpFunction: "o2c_close_order"
    };
    links["cancel"] = {
      href: `/api/v1/o2c/orders/${orderId}/cancel`,
      method: "POST",
      mcpFunction: "o2c_cancel_order"
    };
  }

  return links;
}

function shipmentLinks(shipmentId: string, state: string) {
  const links: Record<string, { href: string; method: "GET" | "POST"; mcpFunction?: string }> = {
    self: { href: `/api/v1/o2c/shipments/${shipmentId}`, method: "GET" }
  };

  if (state === "Planned") {
    links["ship"] = {
      href: `/api/v1/o2c/shipments/${shipmentId}/ship`,
      method: "POST",
      mcpFunction: "o2c_execute_shipment"
    };
    links["cancel"] = {
      href: `/api/v1/o2c/shipments/${shipmentId}/cancel`,
      method: "POST",
      mcpFunction: "o2c_cancel_shipment"
    };
  }

  if (state === "Shipped") {
    links["deliver"] = {
      href: `/api/v1/o2c/shipments/${shipmentId}/deliver`,
      method: "POST",
      mcpFunction: "o2c_deliver_shipment"
    };
    links["cancel"] = {
      href: `/api/v1/o2c/shipments/${shipmentId}/cancel`,
      method: "POST",
      mcpFunction: "o2c_cancel_shipment"
    };
  }

  return links;
}

function invoiceLinks(invoiceId: string, state: string) {
  const links: Record<string, { href: string; method: "GET" | "POST"; mcpFunction?: string }> = {
    self: { href: `/api/v1/o2c/invoices/${invoiceId}`, method: "GET" }
  };

  if (state === "Draft") {
    links["post"] = {
      href: `/api/v1/o2c/invoices/${invoiceId}/post`,
      method: "POST",
      mcpFunction: "o2c_post_ar_invoice"
    };
    links["cancel"] = {
      href: `/api/v1/o2c/invoices/${invoiceId}/cancel`,
      method: "POST",
      mcpFunction: "o2c_cancel_ar_invoice"
    };
  }

  if (state === "Posted") {
    links["cancel"] = {
      href: `/api/v1/o2c/invoices/${invoiceId}/cancel`,
      method: "POST",
      mcpFunction: "o2c_cancel_ar_invoice"
    };
  }

  return links;
}

function paymentLinks(paymentId: string, state: string) {
  const links: Record<string, { href: string; method: "GET" | "POST"; mcpFunction?: string }> = {
    self: { href: `/api/v1/o2c/payments/${paymentId}`, method: "GET" }
  };

  if (state === "Received") {
    links["apply"] = {
      href: `/api/v1/o2c/payments/${paymentId}/apply`,
      method: "POST",
      mcpFunction: "o2c_apply_ar_payment"
    };
    links["cancel"] = {
      href: `/api/v1/o2c/payments/${paymentId}/cancel`,
      method: "POST",
      mcpFunction: "o2c_cancel_ar_payment"
    };
  }

  if (state === "Applied") {
    links["reconcile"] = {
      href: `/api/v1/o2c/payments/${paymentId}/reconcile`,
      method: "POST",
      mcpFunction: "o2c_reconcile_ar_payment"
    };
    links["cancel"] = {
      href: `/api/v1/o2c/payments/${paymentId}/cancel`,
      method: "POST",
      mcpFunction: "o2c_cancel_ar_payment"
    };
  }

  return links;
}

// ── Router ───────────────────────────────────────────────────────────────────

export const o2cRouter = Router();

// -- Customers --

o2cRouter.get("/customers", (_req, res) => {
  const customers = listCustomers().map((row: any) =>
    entityWithLinks(row, customerLinks(row.customer_id, row.state ?? "Active"))
  );
  res.json({ data: customers });
});

o2cRouter.get("/customers/:customerId", (req, res) => {
  const customer = getCustomerById(req.params.customerId);
  res.json(entityWithLinks(customer as any, customerLinks(req.params.customerId, (customer as any).state ?? "Active")));
});

o2cRouter.post("/customers", validateBody(createCustomerSchema), (req, res) => {
  const customer = createCustomer(req.body, req.actor);
  res.status(201).json(entityWithLinks(customer as any, customerLinks((customer as any).customer_id, (customer as any).state ?? "Active")));
});

o2cRouter.post("/customers/:customerId/activate", (req, res) => {
  const customer = activateCustomer(req.params.customerId, req.actor);
  res.json(entityWithLinks(customer as any, customerLinks(req.params.customerId, (customer as any).state ?? "Active")));
});

// -- Quotes --

o2cRouter.get("/quotes", (_req, res) => {
  const quotes = listQuotes().map((quote: any) => entityWithLinks(quote, quoteLinks(quote.quote_id, quote.state)));
  res.json({ data: quotes });
});

o2cRouter.get("/quotes/:quoteId", (req, res) => {
  const quote = getQuoteById(req.params.quoteId);
  res.json(entityWithLinks(quote as any, quoteLinks(req.params.quoteId, (quote as any).state)));
});

o2cRouter.post("/quotes", validateBody(createQuoteSchema), (req, res) => {
  const quote = createQuote(req.body);
  res.status(201).json(entityWithLinks(quote as any, quoteLinks((quote as any).quote_id, (quote as any).state)));
});

o2cRouter.post("/quotes/:quoteId/lines", validateBody(addQuoteLineSchema), (req, res) => {
  const quote = addQuoteLine({
    quoteId: req.params.quoteId,
    sku: req.body.sku,
    quantity: req.body.quantity,
    unitPrice: req.body.unitPrice
  });
  res.status(201).json(entityWithLinks(quote as any, quoteLinks(req.params.quoteId, (quote as any).state)));
});

o2cRouter.post("/quotes/:quoteId/send", (req, res) => {
  const quote = sendQuote(req.params.quoteId, req.actor);
  res.json(entityWithLinks(quote as any, quoteLinks(req.params.quoteId, (quote as any).state)));
});

o2cRouter.post("/quotes/:quoteId/accept", (req, res) => {
  const quote = acceptQuote(req.params.quoteId, req.actor);
  res.json(entityWithLinks(quote as any, quoteLinks(req.params.quoteId, (quote as any).state)));
});

o2cRouter.post("/quotes/:quoteId/reject", (req, res) => {
  const quote = rejectQuote(req.params.quoteId, req.actor);
  res.json(entityWithLinks(quote as any, quoteLinks(req.params.quoteId, (quote as any).state)));
});

o2cRouter.post("/quotes/:quoteId/expire", (req, res) => {
  const quote = expireQuote(req.params.quoteId, req.actor);
  res.json(entityWithLinks(quote as any, quoteLinks(req.params.quoteId, (quote as any).state)));
});

o2cRouter.post("/quotes/:quoteId/convert", (req, res) => {
  const order = createOrderFromQuote(req.params.quoteId, req.actor);
  res.status(201).json(entityWithLinks(order as any, orderLinks((order as any).order_id, (order as any).state)));
});

// -- Orders --

o2cRouter.get("/orders", (_req, res) => {
  const orders = listOrders().map((row: any) => entityWithLinks(row, orderLinks(row.order_id, row.state)));
  res.json({ data: orders });
});

o2cRouter.get("/orders/:orderId", (req, res) => {
  const order = getOrderById(req.params.orderId);
  res.json(entityWithLinks(order as any, orderLinks(req.params.orderId, (order as any).state)));
});

o2cRouter.post("/orders/:orderId/confirm", (req, res) => {
  const order = confirmOrder(req.params.orderId, req.actor);
  res.json(entityWithLinks(order as any, orderLinks(req.params.orderId, (order as any).state)));
});

o2cRouter.post("/orders/:orderId/allocate", (req, res) => {
  const order = allocateOrder(req.params.orderId, req.actor);
  res.json(entityWithLinks(order as any, orderLinks(req.params.orderId, (order as any).state)));
});

o2cRouter.post("/orders/:orderId/ship", (req, res) => {
  const order = shipOrder(req.params.orderId, req.actor);
  res.json(entityWithLinks(order as any, orderLinks(req.params.orderId, (order as any).state)));
});

o2cRouter.post("/orders/:orderId/close", (req, res) => {
  const order = closeOrder(req.params.orderId, req.actor);
  res.json(entityWithLinks(order as any, orderLinks(req.params.orderId, (order as any).state)));
});

o2cRouter.post("/orders/:orderId/cancel", (req, res) => {
  const order = cancelOrder(req.params.orderId, req.actor);
  res.json(entityWithLinks(order as any, orderLinks(req.params.orderId, (order as any).state)));
});

o2cRouter.post("/orders/:orderId/generate-invoice", (req, res) => {
  const invoice = generateInvoice(req.params.orderId);
  res.status(201).json(entityWithLinks(invoice as any, invoiceLinks((invoice as any).invoice_id, (invoice as any).state)));
});

// -- Shipments --

o2cRouter.get("/shipments", (req, res) => {
  const orderId = typeof req.query.orderId === "string" ? req.query.orderId : undefined;
  const rows = listShipments();
  const shipments = (orderId ? rows.filter((row: any) => row.order_id === orderId) : rows).map((row: any) =>
    entityWithLinks(row, shipmentLinks(row.shipment_id, row.state))
  );
  res.json({ data: shipments });
});

o2cRouter.get("/shipments/:shipmentId", (req, res) => {
  const shipment = getShipmentById(req.params.shipmentId);
  res.json(entityWithLinks(shipment as any, shipmentLinks(req.params.shipmentId, (shipment as any).state)));
});

o2cRouter.post("/shipments", validateBody(createShipmentSchema), (req, res) => {
  const shipment = createShipment(req.body.orderId, req.actor);
  res.status(201).json(entityWithLinks(shipment as any, shipmentLinks((shipment as any).shipment_id, (shipment as any).state)));
});

o2cRouter.post("/shipments/:shipmentId/ship", validateBody(shipShipmentSchema), (req, res) => {
  const shipment = executeShipment(req.params.shipmentId, req.body, req.actor);
  res.json(entityWithLinks(shipment as any, shipmentLinks(req.params.shipmentId, (shipment as any).state)));
});

o2cRouter.post("/shipments/:shipmentId/deliver", (req, res) => {
  const shipment = deliverShipment(req.params.shipmentId, req.actor);
  res.json(entityWithLinks(shipment as any, shipmentLinks(req.params.shipmentId, (shipment as any).state)));
});

o2cRouter.post("/shipments/:shipmentId/cancel", (req, res) => {
  const shipment = cancelShipment(req.params.shipmentId, req.actor);
  res.json(entityWithLinks(shipment as any, shipmentLinks(req.params.shipmentId, (shipment as any).state)));
});

// -- Invoices (AR) --

o2cRouter.get("/invoices", (_req, res) => {
  const invoices = listInvoices().map((row: any) => entityWithLinks(row, invoiceLinks(row.invoice_id, row.state)));
  res.json({ data: invoices });
});

o2cRouter.get("/invoices/:invoiceId", (req, res) => {
  const invoice = getInvoiceById(req.params.invoiceId);
  res.json(entityWithLinks(invoice as any, invoiceLinks(req.params.invoiceId, (invoice as any).state)));
});

o2cRouter.post("/invoices/:invoiceId/post", (req, res) => {
  const invoice = postARInvoice(req.params.invoiceId, req.actor);
  res.json(entityWithLinks(invoice as any, invoiceLinks(req.params.invoiceId, (invoice as any).state)));
});

o2cRouter.post("/invoices/:invoiceId/cancel", (req, res) => {
  const invoice = cancelARInvoice(req.params.invoiceId, req.actor);
  res.json(entityWithLinks(invoice as any, invoiceLinks(req.params.invoiceId, (invoice as any).state)));
});

// -- Payments (AR) --

o2cRouter.get("/payments", (_req, res) => {
  const payments = listPayments().map((row: any) => entityWithLinks(row, paymentLinks(row.payment_id, row.state)));
  res.json({ data: payments });
});

o2cRouter.get("/payments/:paymentId", (req, res) => {
  const payment = getPaymentById(req.params.paymentId);
  res.json(entityWithLinks(payment as any, paymentLinks(req.params.paymentId, (payment as any).state)));
});

o2cRouter.post("/payments", validateBody(registerPaymentSchema), (req, res) => {
  const payment = registerPayment(req.body, req.actor);
  res.status(201).json(entityWithLinks(payment as any, paymentLinks((payment as any).payment_id, (payment as any).state)));
});

o2cRouter.post("/payments/:paymentId/apply", (req, res) => {
  const payment = applyARPayment(req.params.paymentId, req.actor);
  res.json(entityWithLinks(payment as any, paymentLinks(req.params.paymentId, (payment as any).state)));
});

o2cRouter.post("/payments/:paymentId/reconcile", (req, res) => {
  const payment = reconcileARPayment(req.params.paymentId, req.actor);
  res.json(entityWithLinks(payment as any, paymentLinks(req.params.paymentId, (payment as any).state)));
});

o2cRouter.post("/payments/:paymentId/cancel", (req, res) => {
  const payment = cancelARPayment(req.params.paymentId, req.actor);
  res.json(entityWithLinks(payment as any, paymentLinks(req.params.paymentId, (payment as any).state)));
});
