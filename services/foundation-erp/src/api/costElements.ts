import { Router, Request, Response } from "express";
import {
  createCostElement,
  getCostElementById,
  listCostElements,
  deactivateCostElement,
} from "../domain/r2r/costElementService";

const router = Router();

/**
 * POST /api/v1/cost-elements
 * Create a new cost element
 */
router.post("/", (req: Request, res: Response) => {
  try {
    const actor = req.actor;
    const {
      organizationId,
      costElementName,
      costElementType,
      costCategory,
      glAccountId,
      taxCodeId,
      allocationMethod,
    } = req.body;

    const costElement = createCostElement(
      {
        organizationId,
        costElementName,
        costElementType,
        costCategory,
        glAccountId,
        taxCodeId,
        allocationMethod,
      },
      actor
    );

    res.status(201).json({
      success: true,
      data: costElement,
      message: `Cost element '${costElement.costElementId}' created successfully`,
    });
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    const statusCode = error.message.includes("not_found") ? 404 : 500;
    res.status(statusCode).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v1/cost-elements/:costElementId
 * Retrieve a cost element by ID
 */
router.get("/:costElementId", (req: Request, res: Response) => {
  try {
    const { costElementId } = req.params;
    const costElement = getCostElementById(costElementId);

    if (!costElement) {
      return res.status(404).json({ success: false, error: "Cost element not found" });
    }

    res.json({ success: true, data: costElement });
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v1/cost-elements
 * List all active cost elements for an organization
 */
router.get("/", (req: Request, res: Response) => {
  try {
    const { organizationId } = req.query;
    if (!organizationId) {
      return res.status(400).json({ success: false, error: "organizationId is required" });
    }

    const limit = Math.min(parseInt(req.query.limit as string) || 100, 1000);
    const offset = parseInt(req.query.offset as string) || 0;

    const costElements = listCostElements(organizationId as string, limit, offset);

    res.json({
      success: true,
      data: costElements,
      limit,
      offset,
      count: costElements.length,
    });
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/v1/cost-elements/:costElementId/deactivate
 * Deactivate a cost element
 */
router.post("/:costElementId/deactivate", (req: Request, res: Response) => {
  try {
    const { costElementId } = req.params;
    const actor = req.actor;

    const costElement = deactivateCostElement(costElementId, actor);

    res.json({
      success: true,
      data: costElement,
      message: `Cost element '${costElementId}' deactivated`,
    });
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    const statusCode = error.message.includes("not_found") ? 404 : 500;
    res.status(statusCode).json({ success: false, error: error.message });
  }
});

export default router;
