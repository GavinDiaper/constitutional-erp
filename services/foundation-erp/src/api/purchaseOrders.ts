import { Router, Request, Response } from "express";
import {
  createPurchaseOrder,
  sendPurchaseOrder,
  approvePurchaseOrder,
  receiveGoods,
  getPurchaseOrderById,
  listPurchaseOrders,
} from "../domain/p2p/purchaseOrder/purchaseOrderService";

const router = Router();

/**
 * POST /api/v1/purchase-orders
 * Create a new purchase order in Draft status
 */
router.post("/", (req: Request, res: Response) => {
  try {
    const actor = req.actor;
    const { supplierId, requisitionId, projectId, wbsId, totalAmount, currencyCode, deliveryAddress, legalEntityId } = req.body;

    const po = createPurchaseOrder(
      {
        supplierId,
        requisitionId,
        projectId,
        wbsId,
        totalAmount,
        currencyCode,
        deliveryAddress,
        legalEntityId,
      },
      actor
    );

    res.status(201).json({
      success: true,
      data: po,
      message: `Purchase order '${(po as { po_id?: string }).po_id ?? ""}' created successfully`,
    });
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    const statusCode = error.message.includes("duplicate") ? 409 : 500;
    res.status(statusCode).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v1/purchase-orders/:poId
 * Retrieve a purchase order by ID
 */
router.get("/:poId", (req: Request, res: Response) => {
  try {
    const { poId } = req.params;
    const po = getPurchaseOrderById(poId);

    if (!po) {
      return res.status(404).json({ success: false, error: "Purchase order not found" });
    }

    res.json({ success: true, data: po });
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v1/purchase-orders
 * List all purchase orders for an organization
 */
router.get("/", (req: Request, res: Response) => {
  try {
    const pos = listPurchaseOrders();

    res.json({
      success: true,
      data: pos,
      count: pos.length,
    });
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/v1/purchase-orders/:poId/release
 * Release purchase order from Draft → Released
 */
router.post("/:poId/release", (req: Request, res: Response) => {
  try {
    const { poId } = req.params;
    const actor = req.actor;

    const po = sendPurchaseOrder(poId, actor);

    res.json({
      success: true,
      data: po,
      message: `Purchase order '${poId}' released`,
    });
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    const statusCode = error.message.includes("invalid_state") ? 400 : 500;
    res.status(statusCode).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/v1/purchase-orders/:poId/approve
 * Approve purchase order (Released → Approved)
 */
router.post("/:poId/approve", (req: Request, res: Response) => {
  try {
    const { poId } = req.params;
    const actor = req.actor;

    const po = approvePurchaseOrder(poId, actor);

    res.json({
      success: true,
      data: po,
      message: `Purchase order '${poId}' approved`,
    });
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    const statusCode = error.message.includes("invalid_state") ? 400 : 500;
    res.status(statusCode).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/v1/purchase-orders/:poId/receive
 * Receive goods against purchase order (Approved → Received)
 */
router.post("/:poId/receive", (req: Request, res: Response) => {
  try {
    const { poId } = req.params;
    const actor = req.actor;
    const { isPartial } = req.body;

    const po = receiveGoods(poId, Boolean(isPartial), actor);

    res.json({
      success: true,
      data: po,
      message: `Purchase order '${poId}' received`,
    });
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    const statusCode = error.message.includes("invalid_state") ? 400 : 500;
    res.status(statusCode).json({ success: false, error: error.message });
  }
});

export default router;
