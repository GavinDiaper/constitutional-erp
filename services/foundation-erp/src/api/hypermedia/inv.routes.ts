import { Router } from "express";
import { z } from "zod";
import { validateBody } from "../../middleware/validate";
import { entityWithLinks } from "../../utils/hypermedia";
import {
  createReservation,
  createInventoryOrganization,
  createSku,
  getInventoryOrganizationById,
  getReservationById,
  getSkuById,
  listInventoryOrganizations,
  listMovements,
  listOnHand,
  listReservations,
  listSkus,
  postInventoryMovement,
  releaseReservation
} from "../../domain/inv/inventoryService";

const createSkuSchema = z.object({
  skuCode: z.string().min(1),
  description: z.string().min(1),
  category: z.string().optional(),
  uom: z.string().min(1),
  valuationMethod: z.enum(["standard", "moving_average"]),
  standardCost: z.number().nonnegative().optional()
});

const createOrganizationSchema = z.object({
  name: z.string().min(1),
  ledgerId: z.string().min(1).optional(),
  inventoryAssetAccountCode: z.string().min(1).optional(),
  cogsAccountCode: z.string().min(1).optional()
});

const createMovementSchema = z.object({
  skuId: z.string().min(1),
  organizationId: z.string().min(1),
  movementType: z.enum(["receipt", "issue", "adjustment", "cost_update"]),
  quantity: z.number(),
  unitCost: z.number().nonnegative().optional(),
  reason: z.string().optional(),
  referenceType: z.string().optional(),
  referenceId: z.string().optional(),
  correlationKey: z.string().optional(),
  projectId: z.string().min(1).optional(),
  projectWipId: z.string().min(1).optional(),
  bomId: z.string().min(1).optional(),
  bomComponentFlag: z.boolean().optional(),
  isProjectFinishedGood: z.boolean().optional()
});

const createReservationSchema = z.object({
  skuId: z.string().min(1),
  organizationId: z.string().min(1),
  reservationType: z.enum(["soft", "hard"]),
  quantity: z.number().positive(),
  referenceType: z.string().optional(),
  referenceId: z.string().optional(),
  reason: z.string().optional(),
  correlationKey: z.string().optional(),
  expiresAt: z.string().datetime().optional()
});

const releaseReservationSchema = z.object({
  reason: z.string().optional(),
  expectedVersion: z.number().int().positive().optional()
});

function skuLinks(skuId: string) {
  return {
    self: { href: `/api/v1/inv/skus/${skuId}`, method: "GET" as const },
    "post-movement": {
      href: "/api/v1/inv/movements",
      method: "POST" as const,
      mcpFunction: "inv_post_movement",
      governance: { riskLevel: "Medium" as const, requiredTier: 1 as const }
    }
  };
}

function organizationLinks(organizationId: string) {
  return {
    self: { href: `/api/v1/inv/organizations/${organizationId}`, method: "GET" as const },
    "list-on-hand": {
      href: `/api/v1/inv/on-hand?organizationId=${organizationId}`,
      method: "GET" as const
    }
  };
}

function reservationLinks(reservationId: string) {
  return {
    self: { href: `/api/v1/inv/reservations/${reservationId}`, method: "GET" as const },
    release: {
      href: `/api/v1/inv/reservations/${reservationId}/release`,
      method: "POST" as const,
      mcpFunction: "inv_release_reservation",
      governance: { riskLevel: "Low" as const, requiredTier: 1 as const }
    }
  };
}

export const invRouter = Router();

invRouter.get("/skus", (_req, res) => {
  const rows = listSkus().map((row) => entityWithLinks(row as Record<string, unknown>, skuLinks(String((row as Record<string, unknown>).sku_id))));
  res.json({ data: rows });
});

invRouter.post("/skus", validateBody(createSkuSchema), (req, res) => {
  const sku = createSku(req.body, req.actor);
  res.status(201).json(entityWithLinks(sku as Record<string, unknown>, skuLinks(String((sku as Record<string, unknown>).sku_id))));
});

invRouter.get("/skus/:skuId", (req, res) => {
  const sku = getSkuById(req.params.skuId);
  res.json(entityWithLinks(sku as Record<string, unknown>, skuLinks(req.params.skuId)));
});

invRouter.get("/organizations", (_req, res) => {
  const rows = listInventoryOrganizations().map((row) =>
    entityWithLinks(row as Record<string, unknown>, organizationLinks(String((row as Record<string, unknown>).organization_id)))
  );
  res.json({ data: rows });
});

invRouter.post("/organizations", validateBody(createOrganizationSchema), (req, res) => {
  const organization = createInventoryOrganization(req.body, req.actor);
  res
    .status(201)
    .json(entityWithLinks(organization as Record<string, unknown>, organizationLinks(String((organization as Record<string, unknown>).organization_id))));
});

invRouter.get("/organizations/:organizationId", (req, res) => {
  const organization = getInventoryOrganizationById(req.params.organizationId);
  res.json(entityWithLinks(organization as Record<string, unknown>, organizationLinks(req.params.organizationId)));
});

invRouter.post("/movements", validateBody(createMovementSchema), (req, res) => {
  const movement = postInventoryMovement(req.body, req.actor);
  res.status(201).json(
    entityWithLinks(movement as Record<string, unknown>, {
      self: { href: `/api/v1/inv/movements/${String((movement as Record<string, unknown>).movement_id)}`, method: "GET" },
      "list-on-hand": { href: `/api/v1/inv/on-hand?skuId=${req.body.skuId}&organizationId=${req.body.organizationId}`, method: "GET" }
    })
  );
});

invRouter.get("/movements", (_req, res) => {
  res.json({ data: listMovements() });
});

invRouter.get("/on-hand", (req, res) => {
  const skuId = typeof req.query.skuId === "string" ? req.query.skuId : undefined;
  const organizationId = typeof req.query.organizationId === "string" ? req.query.organizationId : undefined;
  const rows = listOnHand({ skuId, organizationId });
  res.json({ data: rows });
});

invRouter.post("/reservations", validateBody(createReservationSchema), (req, res) => {
  const reservation = createReservation(req.body, req.actor);
  res.status(201).json(entityWithLinks(reservation as Record<string, unknown>, reservationLinks(String((reservation as Record<string, unknown>).reservation_id))));
});

invRouter.get("/reservations", (req, res) => {
  const skuId = typeof req.query.skuId === "string" ? req.query.skuId : undefined;
  const organizationId = typeof req.query.organizationId === "string" ? req.query.organizationId : undefined;
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const reservationType = typeof req.query.reservationType === "string" ? req.query.reservationType : undefined;
  const rows = listReservations({
    skuId,
    organizationId,
    status: status as "Active" | "Released" | "Fulfilled" | "Cancelled" | undefined,
    reservationType: reservationType as "soft" | "hard" | undefined
  }).map((row) => entityWithLinks(row as Record<string, unknown>, reservationLinks(String((row as Record<string, unknown>).reservation_id))));
  res.json({ data: rows });
});

invRouter.get("/reservations/:reservationId", (req, res) => {
  const reservation = getReservationById(req.params.reservationId);
  res.json(entityWithLinks(reservation as Record<string, unknown>, reservationLinks(req.params.reservationId)));
});

invRouter.post("/reservations/:reservationId/release", validateBody(releaseReservationSchema), (req, res) => {
  const reservation = releaseReservation(req.params.reservationId, req.body, req.actor);
  res.json(entityWithLinks(reservation as Record<string, unknown>, reservationLinks(req.params.reservationId)));
});
