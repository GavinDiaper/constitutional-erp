import { Router } from "express";
import { z } from "zod";
import { validateBody } from "../../middleware/validate";
import { entityWithLinks } from "../../utils/hypermedia";
import {
  addQuoteLine,
  createQuote,
  getQuoteById,
  listQuotes,
  updateQuoteState
} from "../../domain/o2c/quote/quoteService";
import { createCustomer, getCustomerById, listCustomers } from "../../domain/o2c/customer/customerService";
import { createOrderFromQuote, getOrderById, listOrders, updateOrderState } from "../../domain/o2c/order/salesOrderService";
import { generateInvoice, getInvoiceById, listInvoices, updateInvoiceState } from "../../domain/o2c/invoice/invoiceService";
import { getPaymentById, listPayments, registerPayment, updatePaymentState } from "../../domain/o2c/payment/paymentService";

const createCustomerSchema = z.object({
  customerName: z.string().min(1),
  email: z.string().email().optional()
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
  amount: z.number().positive()
});

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
  }

  if (state === "Sent") {
    links["accept"] = {
      href: `/api/v1/o2c/quotes/${quoteId}/accept`,
      method: "POST",
      mcpFunction: "o2c_accept_quote"
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
    links["confirm"] = { href: `/api/v1/o2c/orders/${orderId}/confirm`, method: "POST", mcpFunction: "o2c_confirm_order" };
  }
  if (state === "Confirmed") {
    links["allocate"] = {
      href: `/api/v1/o2c/orders/${orderId}/allocate`,
      method: "POST",
      mcpFunction: "o2c_allocate_stock"
    };
  }
  if (state === "Allocated") {
    links["ship"] = { href: `/api/v1/o2c/orders/${orderId}/ship`, method: "POST", mcpFunction: "o2c_ship_order" };
  }
  if (state === "Shipped") {
    links["generate-invoice"] = {
      href: `/api/v1/o2c/orders/${orderId}/generate-invoice`,
      method: "POST",
      mcpFunction: "o2c_generate_invoice"
    };
  }

  return links;
}

function invoiceLinks(invoiceId: string, state: string) {
  const links: Record<string, { href: string; method: "GET" | "POST"; mcpFunction?: string }> = {
    self: { href: `/api/v1/o2c/invoices/${invoiceId}`, method: "GET" }
  };

  if (state === "Draft") {
    links["post"] = { href: `/api/v1/o2c/invoices/${invoiceId}/post`, method: "POST", mcpFunction: "o2c_post_invoice" };
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
      mcpFunction: "o2c_apply_payment_to_invoice"
    };
  }

  return links;
}

export const o2cRouter = Router();

o2cRouter.get("/customers", (_req, res) => {
  const customers = listCustomers().map((row: any) =>
    entityWithLinks(row, { self: { href: `/api/v1/o2c/customers/${row.customer_id}`, method: "GET" } })
  );
  res.json({ data: customers });
});

o2cRouter.get("/customers/:customerId", (req, res) => {
  const customer = getCustomerById(req.params.customerId);
  res.json(entityWithLinks(customer as any, { self: { href: `/api/v1/o2c/customers/${req.params.customerId}`, method: "GET" } }));
});

o2cRouter.post("/customers", validateBody(createCustomerSchema), (req, res) => {
  const customer = createCustomer(req.body);
  res.status(201).json(entityWithLinks(customer as any, { self: { href: `/api/v1/o2c/customers/${(customer as any).customer_id}`, method: "GET" } }));
});

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
  const quote = updateQuoteState(req.params.quoteId, "Sent");
  res.json(entityWithLinks(quote as any, quoteLinks(req.params.quoteId, (quote as any).state)));
});

o2cRouter.post("/quotes/:quoteId/accept", (req, res) => {
  const quote = updateQuoteState(req.params.quoteId, "Accepted");
  res.json(entityWithLinks(quote as any, quoteLinks(req.params.quoteId, (quote as any).state)));
});

o2cRouter.post("/quotes/:quoteId/convert", (req, res) => {
  const order = createOrderFromQuote(req.params.quoteId);
  res.status(201).json(entityWithLinks(order as any, orderLinks((order as any).order_id, (order as any).state)));
});

o2cRouter.get("/orders", (_req, res) => {
  const orders = listOrders().map((row: any) => entityWithLinks(row, orderLinks(row.order_id, row.state)));
  res.json({ data: orders });
});

o2cRouter.get("/orders/:orderId", (req, res) => {
  const order = getOrderById(req.params.orderId);
  res.json(entityWithLinks(order as any, orderLinks(req.params.orderId, (order as any).state)));
});

o2cRouter.post("/orders/:orderId/confirm", (req, res) => {
  const order = updateOrderState(req.params.orderId, "Confirmed");
  res.json(entityWithLinks(order as any, orderLinks(req.params.orderId, (order as any).state)));
});

o2cRouter.post("/orders/:orderId/allocate", (req, res) => {
  const order = updateOrderState(req.params.orderId, "Allocated");
  res.json(entityWithLinks(order as any, orderLinks(req.params.orderId, (order as any).state)));
});

o2cRouter.post("/orders/:orderId/ship", (req, res) => {
  const order = updateOrderState(req.params.orderId, "Shipped");
  res.json(entityWithLinks(order as any, orderLinks(req.params.orderId, (order as any).state)));
});

o2cRouter.post("/orders/:orderId/generate-invoice", (req, res) => {
  const invoice = generateInvoice(req.params.orderId);
  res.status(201).json(entityWithLinks(invoice as any, invoiceLinks((invoice as any).invoice_id, (invoice as any).state)));
});

o2cRouter.get("/invoices", (_req, res) => {
  const invoices = listInvoices().map((row: any) => entityWithLinks(row, invoiceLinks(row.invoice_id, row.state)));
  res.json({ data: invoices });
});

o2cRouter.get("/invoices/:invoiceId", (req, res) => {
  const invoice = getInvoiceById(req.params.invoiceId);
  res.json(entityWithLinks(invoice as any, invoiceLinks(req.params.invoiceId, (invoice as any).state)));
});

o2cRouter.post("/invoices/:invoiceId/post", (req, res) => {
  const invoice = updateInvoiceState(req.params.invoiceId, "Posted");
  res.json(entityWithLinks(invoice as any, invoiceLinks(req.params.invoiceId, (invoice as any).state)));
});

o2cRouter.get("/payments", (_req, res) => {
  const payments = listPayments().map((row: any) => entityWithLinks(row, paymentLinks(row.payment_id, row.state)));
  res.json({ data: payments });
});

o2cRouter.get("/payments/:paymentId", (req, res) => {
  const payment = getPaymentById(req.params.paymentId);
  res.json(entityWithLinks(payment as any, paymentLinks(req.params.paymentId, (payment as any).state)));
});

o2cRouter.post("/payments", validateBody(registerPaymentSchema), (req, res) => {
  const payment = registerPayment(req.body);
  res.status(201).json(entityWithLinks(payment as any, paymentLinks((payment as any).payment_id, (payment as any).state)));
});

o2cRouter.post("/payments/:paymentId/apply", (req, res) => {
  const payment = updatePaymentState(req.params.paymentId, "Applied");
  res.json(entityWithLinks(payment as any, paymentLinks(req.params.paymentId, (payment as any).state)));
});

o2cRouter.post("/payments/:paymentId/reconcile", (req, res) => {
  const payment = updatePaymentState(req.params.paymentId, "Reconciled");
  res.json(entityWithLinks(payment as any, paymentLinks(req.params.paymentId, (payment as any).state)));
});
