import { Router, Request, Response } from "express";
import {
  createInternalTrade,
  releaseInternalTrade,
  approveInternalTrade,
  getInternalTradeById,
  listInternalTrades,
} from "../domain/itr/internalTradeService";

const router = Router();

/**
 * POST /api/v1/internal-trades
 * Create a new internal PO/SO in Draft status
 */
router.post("/", (req: Request, res: Response) => {
  try {
    const actor = req.actor;
    const {
      organizationId,
      tradeType,
      tradeNumber,
      tradeDate,
      fromDepartment,
      toDepartment,
      projectId,
      transferPricingMethod,
      transferPricingValue,
    } = req.body;

    const trade = createInternalTrade(
      {
        organizationId,
        tradeType,
        tradeNumber,
        tradeDate,
        fromDepartment,
        toDepartment,
        projectId,
        transferPricingMethod,
        transferPricingValue,
      },
      actor
    );

    res.status(201).json({
      success: true,
      data: trade,
      message: `Internal trade '${trade.tradeId}' created successfully`,
    });
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    const statusCode = error.message.includes("duplicate") ? 409 : 500;
    res.status(statusCode).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v1/internal-trades/:tradeId
 * Retrieve an internal trade by ID
 */
router.get("/:tradeId", (req: Request, res: Response) => {
  try {
    const { tradeId } = req.params;
    const trade = getInternalTradeById(tradeId);

    if (!trade) {
      return res.status(404).json({ success: false, error: "Internal trade not found" });
    }

    res.json({ success: true, data: trade });
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v1/internal-trades
 * List all internal trades for an organization
 */
router.get("/", (req: Request, res: Response) => {
  try {
    const { organizationId } = req.query;
    if (!organizationId) {
      return res.status(400).json({ success: false, error: "organizationId is required" });
    }

    const limit = Math.min(parseInt(req.query.limit as string) || 100, 1000);
    const offset = parseInt(req.query.offset as string) || 0;

    const trades = listInternalTrades(organizationId as string, limit, offset);

    res.json({
      success: true,
      data: trades,
      limit,
      offset,
      count: trades.length,
    });
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/v1/internal-trades/:tradeId/release
 * Release internal trade from Draft → Released
 */
router.post("/:tradeId/release", (req: Request, res: Response) => {
  try {
    const { tradeId } = req.params;
    const actor = req.actor;

    const trade = releaseInternalTrade(tradeId, actor);

    res.json({
      success: true,
      data: trade,
      message: `Internal trade '${tradeId}' released`,
    });
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    const statusCode = error.message.includes("invalid_state") ? 400 : 500;
    res.status(statusCode).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/v1/internal-trades/:tradeId/approve
 * Approve internal trade (Released → Approved)
 */
router.post("/:tradeId/approve", (req: Request, res: Response) => {
  try {
    const { tradeId } = req.params;
    const actor = req.actor;

    const trade = approveInternalTrade(tradeId, actor);

    res.json({
      success: true,
      data: trade,
      message: `Internal trade '${tradeId}' approved`,
    });
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    const statusCode = error.message.includes("invalid_state") ? 400 : 500;
    res.status(statusCode).json({ success: false, error: error.message });
  }
});

export default router;
