import { Router } from "express";
import { z } from "zod";
import { NavigatorService } from "../services/navigatorService";
import { HttpError } from "../utils/errors";
import { recordTranscript } from "../domain/stores/navigatorStore";

const domainSchema = z.union([z.literal("P2P"), z.literal("O2C"), z.literal("R2R"), z.literal("H2R")]);

const contextSchema = z.object({
  domain: z.string().transform((value) => value.toUpperCase()).pipe(domainSchema),
  aggregateType: z.string().min(1),
  aggregateId: z.string().min(1),
  actorId: z.string().min(1),
  userNote: z.string().trim().max(4000).optional()
});

const optionalActionSchema = z.object({
  actionId: z.string().min(1).optional()
});

const requiredActionSchema = z.object({
  actionId: z.string().min(1)
});

const transcriptSchema = z.object({
  actorId: z.string().min(1).optional(),
  commandText: z.string().min(1),
  outputText: z.string().min(1)
});

const createOperationSchema = z.union([
  z.literal("create-supplier"),
  z.literal("create-requisition"),
  z.literal("create-purchase-order"),
  z.literal("create-fiscal-year"),
  z.literal("create-fiscal-period"),
  z.literal("create-payment")
]);

const createLookupKindSchema = z.union([
  z.literal("suppliers"),
  z.literal("ledgers"),
  z.literal("fiscal-years"),
  z.literal("invoices")
]);

const promptCreateSchema = z.object({
  prompt: z.string().trim().min(1).max(4000),
  actorId: z.string().min(1),
  domain: z.string().transform((value) => value.toUpperCase()).pipe(domainSchema).optional(),
  dryRun: z.boolean().optional()
});

const nextStepsSchema = z.object({
  context: contextSchema,
  limit: z.number().int().positive().max(20).optional()
});

const approvalStatusSchema = z.union([
  z.literal("PENDING"),
  z.literal("APPROVED"),
  z.literal("REJECTED"),
  z.literal("ESCALATED"),
  z.literal("EXPIRED")
]);

const approvalListSchema = z.object({
  domain: z.string().transform((value) => value.toUpperCase()).pipe(domainSchema),
  aggregateType: z.string().min(1),
  aggregateId: z.string().min(1),
  status: approvalStatusSchema.optional()
});

export function createNavigatorRouter(service: NavigatorService) {
  const router = Router();

  router.get("/resource", async (req, res, next) => {
    try {
      const context = contextSchema.parse(req.query);
      const resource = await service.getResource(context);
      res.json(resource);
    } catch (error) {
      next(error);
    }
  });

  router.post("/rank", async (req, res, next) => {
    try {
      const context = contextSchema.parse(req.body ?? {});
      const result = await service.rank(context);
      res.json({
        rankedActions: result.rankedActions,
        actionOptions: result.context.actionOptions
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/explain", async (req, res, next) => {
    try {
      const body = z.object({
        context: contextSchema,
        actionId: z.string().min(1).optional()
      }).parse(req.body ?? {});

      const explanation = await service.explain(body.context, body.actionId);
      res.json({ explanation });
    } catch (error) {
      next(error);
    }
  });

  router.post("/simulate", async (req, res, next) => {
    try {
      const body = z.object({
        context: contextSchema,
        actionId: z.string().min(1)
      }).parse(req.body ?? {});

      const result = await service.simulate(body.context, body.actionId);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  router.post("/decide", async (req, res, next) => {
    try {
      const context = contextSchema.parse(req.body ?? {});
      const result = await service.decide(context);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  router.post("/execute", async (req, res, next) => {
    try {
      const body = z.object({
        context: contextSchema,
        actionId: z.string().min(1).optional()
      }).parse(req.body ?? {});

      const result = await service.execute(body.context, body.actionId);
      res.status(result.statusCode === 204 ? 200 : result.statusCode).json(result);
    } catch (error) {
      next(error);
    }
  });

  router.get("/history", async (req, res, next) => {
    try {
      const context = contextSchema.parse(req.query);
      const limitValue = req.query["limit"];
      const limit = limitValue ? Number(limitValue) : 100;
      if (!Number.isFinite(limit) || limit <= 0) {
        throw new HttpError(400, "invalid_limit", "Query parameter 'limit' must be a positive number");
      }

      const result = await service.history(context, limit);
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  });

  router.get("/navlog", async (req, res, next) => {
    try {
      const context = contextSchema.parse(req.query);
      const limitValue = req.query["limit"];
      const limit = limitValue ? Number(limitValue) : 100;
      if (!Number.isFinite(limit) || limit <= 0) {
        throw new HttpError(400, "invalid_limit", "Query parameter 'limit' must be a positive number");
      }

      const result = await service.navlog(context, limit);
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  });

  router.get("/approvals", async (req, res, next) => {
    try {
      const query = approvalListSchema.parse(req.query);
      const limitValue = req.query["limit"];
      const limit = limitValue ? Number(limitValue) : 100;
      if (!Number.isFinite(limit) || limit <= 0) {
        throw new HttpError(400, "invalid_limit", "Query parameter 'limit' must be a positive number");
      }

      const result = await service.approvals({
        domain: query.domain,
        aggregateType: query.aggregateType,
        aggregateId: query.aggregateId,
        status: query.status,
        limit
      });
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  });

  router.get("/approvals/:approvalRequestId", async (req, res, next) => {
    try {
      const approvalRequestId = z.string().uuid().parse(req.params.approvalRequestId);
      const result = await service.approval(approvalRequestId);
      if (!result) {
        throw new HttpError(404, "approval_not_found", `Approval request '${approvalRequestId}' was not found`);
      }

      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  router.post("/transcript", (req, res, next) => {
    try {
      const body = transcriptSchema.parse(req.body ?? {});
      recordTranscript(body.actorId, body.commandText, body.outputText);
      res.status(201).json({ status: "ok" });
    } catch (error) {
      next(error);
    }
  });

  router.get("/actions", async (req, res, next) => {
    try {
      const context = contextSchema.parse(req.query);
      const actions = await service.actions(context);
      res.json({ data: actions });
    } catch (error) {
      next(error);
    }
  });

  router.post("/create", async (req, res, next) => {
    try {
      const body = z.object({
        operation: createOperationSchema,
        actorId: z.string().min(1),
        payload: z.record(z.unknown()).optional()
      }).parse(req.body ?? {});

      const result = await service.createEntity({
        operation: body.operation,
        actorId: body.actorId,
        payload: body.payload ?? {}
      });
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  });

  router.get("/create/lookups/:kind", async (req, res, next) => {
    try {
      const kind = createLookupKindSchema.parse(req.params.kind);
      const actorId = String(req.query.actorId ?? req.header("x-actor-id") ?? "principal.system");
      const data = await service.createLookups(kind, actorId);
      res.json({ data });
    } catch (error) {
      next(error);
    }
  });

  router.post("/create/prompt", async (req, res, next) => {
    try {
      const body = promptCreateSchema.parse(req.body ?? {});
      const result = await service.promptCreate(body);
      res.status(result.created ? 201 : 200).json(result);
    } catch (error) {
      next(error);
    }
  });

  router.post("/next-steps", async (req, res, next) => {
    try {
      const body = nextStepsSchema.parse(req.body ?? {});
      const result = await service.nextSteps(body.context, body.limit);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
