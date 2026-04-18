import { Router, Request, Response } from "express";
import {
  createOrderFromQuote,
  confirmOrder,
  allocateOrder,
  shipOrder,
  getOrderById,
  listOrders,
} from "../domain/o2c/order/salesOrderService";

const router = Router();

/**
 * POST /api/v1/sales-orders
 * Create a new sales order in Draft status
 */
router.post("/", (req: Request, res: Response) => {
  try {
    const actor = req.actor;
    const { quoteId, legalEntityId } = req.body;

    if (!quoteId) {
      return res.status(400).json({ success: false, error: "quoteId is required" });
    }

    const so = createOrderFromQuote(quoteId, legalEntityId);

    res.status(201).json({
      success: true,
      data: so,
      message: `Sales order '${(so as { order_id?: string }).order_id ?? ""}' created successfully`,
    });
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    const statusCode = error.message.includes("duplicate") ? 409 : 500;
    res.status(statusCode).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v1/sales-orders/:soId
 * Retrieve a sales order by ID
 */
router.get("/:soId", (req: Request, res: Response) => {
  try {
    const { soId } = req.params;
    const so = getOrderById(soId);

    if (!so) {
      return res.status(404).json({ success: false, error: "Sales order not found" });
    }

    res.json({ success: true, data: so });
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v1/sales-orders
 * List all sales orders for an organization
 */
router.get("/", (req: Request, res: Response) => {
  try {
    const sos = listOrders();

    res.json({
      success: true,
      data: sos,
      count: sos.length,
    });
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/v1/sales-orders/:soId/release
 * Release sales order from Draft → Released
 */
router.post("/:soId/release", (req: Request, res: Response) => {
  try {
    const { soId } = req.params;
    const actor = req.actor;

    const so = confirmOrder(soId, actor);

    res.json({
      success: true,
      data: so,
      message: `Sales order '${soId}' released`,
    });
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    const statusCode = error.message.includes("invalid_state") ? 400 : 500;
    res.status(statusCode).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/v1/sales-orders/:soId/approve
 * Approve sales order (Released → Approved)
 */
router.post("/:soId/approve", (req: Request, res: Response) => {
  try {
    const { soId } = req.params;
    const actor = req.actor;

    const so = allocateOrder(soId, actor);

    res.json({
      success: true,
      data: so,
      message: `Sales order '${soId}' approved`,
    });
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    const statusCode = error.message.includes("invalid_state") ? 400 : 500;
    res.status(statusCode).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/v1/sales-orders/:soId/confirm-shipment
 * Confirm shipment of sales order (Approved → Shipped)
 */
router.post("/:soId/confirm-shipment", (req: Request, res: Response) => {
  try {
    const { soId } = req.params;
    const actor = req.actor;
    const so = shipOrder(soId, actor);

    res.json({
      success: true,
      data: so,
      message: `Shipment confirmed for sales order '${soId}'`,
    });
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    const statusCode = error.message.includes("invalid_state") ? 400 : 500;
    res.status(statusCode).json({ success: false, error: error.message });
  }
});

export default router;
