import { Router, Request, Response } from "express";
import { createBOMHeader, activateBOMHeader, getBOMHeaderById, listBOMHeaders } from "../domain/inv/bomService";

const router = Router();

/**
 * POST /api/v1/bom
 * Create a new BOM in Draft status
 */
router.post("/", (req: Request, res: Response) => {
  try {
    const actor = req.actor;
    const { skuId, organizationId, revision, description, projectEligible, costingProfile, effectiveDate, endDate } =
      req.body;

    const bom = createBOMHeader(
      {
        skuId,
        organizationId,
        revision,
        description,
        projectEligible,
        costingProfile,
        effectiveDate,
        endDate,
      },
      actor
    );

    res.status(201).json({
      success: true,
      data: bom,
      message: `BOM '${bom.bomId}' created successfully`,
    });
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v1/bom/:bomId
 * Retrieve a BOM by ID
 */
router.get("/:bomId", (req: Request, res: Response) => {
  try {
    const { bomId } = req.params;
    const bom = getBOMHeaderById(bomId);

    if (!bom) {
      return res.status(404).json({ success: false, error: "BOM not found" });
    }

    res.json({ success: true, data: bom });
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v1/bom
 * List all BOMs for an organization
 */
router.get("/", (req: Request, res: Response) => {
  try {
    const { organizationId } = req.query;
    if (!organizationId) {
      return res.status(400).json({ success: false, error: "organizationId is required" });
    }

    const limit = Math.min(parseInt(req.query.limit as string) || 100, 1000);
    const offset = parseInt(req.query.offset as string) || 0;

    const boms = listBOMHeaders(organizationId as string, limit, offset);

    res.json({
      success: true,
      data: boms,
      limit,
      offset,
      count: boms.length,
    });
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/v1/bom/:bomId/activate
 * Transition BOM from Draft → Active
 */
router.post("/:bomId/activate", (req: Request, res: Response) => {
  try {
    const { bomId } = req.params;
    const actor = req.actor;

    const bom = activateBOMHeader(bomId, actor);

    res.json({
      success: true,
      data: bom,
      message: `BOM '${bomId}' activated`,
    });
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    const statusCode = error.message.includes("invalid_state") ? 400 : 500;
    res.status(statusCode).json({ success: false, error: error.message });
  }
});

export default router;
