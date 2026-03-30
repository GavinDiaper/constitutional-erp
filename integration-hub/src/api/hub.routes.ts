import { Router } from "express";
import { z } from "zod";
import { ProcessFacade } from "../domain/processFacade";
import { SessionStore } from "../domain/sessionStore";
import { McpCatalog } from "../domain/mcpCatalog";
import { HubNavlogEntry, SessionMode } from "../domain/types";

const sessionCreateSchema = z.object({
  actorId: z.string().min(1),
  mode: z.union([z.literal("offline"), z.literal("online")]),
  context: z.record(z.unknown()).optional()
});

const sessionPathSchema = z.object({
  sessionId: z.string().uuid()
});

const processPathSchema = z.object({
  entityType: z.string().min(1),
  entityId: z.string().min(1)
});

const processActionPathSchema = processPathSchema.extend({
  action: z.string().min(1)
});

const proposalEntrySchema = z.object({
  type: z.literal("proposal"),
  timestamp: z.string().datetime({ offset: true }),
  entityType: z.string().min(1),
  entityId: z.string().min(1),
  candidates: z.array(z.object({
    rel: z.string().min(1),
    riskLevel: z.union([z.literal("Low"), z.literal("Medium"), z.literal("High")]).optional(),
    requiredTier: z.number().int().positive().optional(),
    score: z.number().optional(),
    reason: z.string().optional(),
    executable: z.boolean().optional()
  }))
});

const simulationEntrySchema = z.object({
  type: z.literal("simulation"),
  timestamp: z.string().datetime({ offset: true }),
  entityType: z.string().min(1),
  entityId: z.string().min(1),
  action: z.string().min(1),
  mode: z.union([z.literal("offline"), z.literal("online")]),
  outcome: z.object({
    predictedState: z.string().min(1),
    predictedEvents: z.array(z.string()),
    riskLevel: z.union([z.literal("Low"), z.literal("Medium"), z.literal("High")]).optional()
  })
});

const decisionEntrySchema = z.object({
  type: z.literal("decision"),
  timestamp: z.string().datetime({ offset: true }),
  entityType: z.string().min(1),
  entityId: z.string().min(1),
  chosenAction: z.string().min(1),
  reason: z.string().min(1),
  governance: z.object({
    requiredTier: z.number().int().positive().optional(),
    actorTier: z.number().int().positive().optional(),
    riskLevel: z.union([z.literal("Low"), z.literal("Medium"), z.literal("High")]).optional()
  }).optional()
});

const executionEntrySchema = z.object({
  type: z.literal("execution"),
  timestamp: z.string().datetime({ offset: true }),
  entityType: z.string().min(1),
  entityId: z.string().min(1),
  action: z.string().min(1),
  result: z.union([z.literal("success"), z.literal("failure")]),
  httpStatus: z.number().int().min(100).max(599)
});

const navlogEntrySchema = z.union([
  proposalEntrySchema,
  simulationEntrySchema,
  decisionEntrySchema,
  executionEntrySchema
]);

const transcriptEntrySchema = z.object({
  input: z.string().min(1),
  output: z.string().min(1),
  timestamp: z.string().datetime({ offset: true })
});

export function createHubRouter(deps: {
  processFacade: ProcessFacade;
  catalog: McpCatalog;
  sessionStore: SessionStore;
}) {
  const router = Router();

  router.get("/process/:entityType/:entityId", async (req, res, next) => {
    try {
      const params = processPathSchema.parse(req.params ?? {});
      const actorId = req.header("x-actor-id") ?? undefined;
      const process = await deps.processFacade.getProcess(params.entityType, params.entityId, actorId);
      res.json({
        entityType: process.entityType ?? process.entity,
        entityId: process.entityId ?? process.id,
        state: process.state,
        attributes: process.attributes,
        links: process.links
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/mcp/functions", (_req, res) => {
    const functions = deps.catalog.list().map((fn) => ({
      id: fn.id,
      entity: fn.aggregateType,
      action: fn.action,
      riskLevel: fn.riskLevel,
      governanceTag: fn.governanceTag,
      requiredTier: fn.requiredTier,
      inputSchema: fn.inputSchema,
      outputSchema: fn.outputSchema
    }));

    res.json(functions);
  });

  router.post("/process/:entityType/:entityId/actions/:action", async (req, res, next) => {
    try {
      const params = processActionPathSchema.parse(req.params ?? {});
      const actorId = req.header("x-actor-id") ?? undefined;
      const payload = (req.body ?? {}) as Record<string, unknown>;
      const result = await deps.processFacade.executeAction({
        entity: params.entityType,
        id: params.entityId,
        action: params.action,
        payload,
        actorId
      });

      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  router.post("/sessions", (req, res, next) => {
    try {
      const body = sessionCreateSchema.parse(req.body ?? {});
      const created = deps.sessionStore.createSession({
        actorId: body.actorId,
        mode: body.mode as SessionMode,
        context: body.context
      });

      res.status(201).json({ sessionId: created.sessionId });
    } catch (error) {
      next(error);
    }
  });

  router.post("/sessions/:sessionId/navlog", (req, res, next) => {
    try {
      const params = sessionPathSchema.parse(req.params ?? {});
      const body = navlogEntrySchema.parse(req.body ?? {});
      deps.sessionStore.appendNavlog(params.sessionId, body as HubNavlogEntry);
      res.status(201).json({ status: "ok" });
    } catch (error) {
      next(error);
    }
  });

  router.get("/sessions/:sessionId/navlog", (req, res, next) => {
    try {
      const params = sessionPathSchema.parse(req.params ?? {});
      const data = deps.sessionStore.listNavlog(params.sessionId);
      res.json({ data });
    } catch (error) {
      next(error);
    }
  });

  router.post("/sessions/:sessionId/transcript", (req, res, next) => {
    try {
      const params = sessionPathSchema.parse(req.params ?? {});
      const body = transcriptEntrySchema.parse(req.body ?? {});
      deps.sessionStore.appendTranscript(params.sessionId, body);
      res.status(201).json({ status: "ok" });
    } catch (error) {
      next(error);
    }
  });

  router.get("/sessions/:sessionId/transcript", (req, res, next) => {
    try {
      const params = sessionPathSchema.parse(req.params ?? {});
      const data = deps.sessionStore.listTranscript(params.sessionId);
      res.json({ data });
    } catch (error) {
      next(error);
    }
  });

  router.get("/sessions/:sessionId", (req, res, next) => {
    try {
      const params = sessionPathSchema.parse(req.params ?? {});
      const session = deps.sessionStore.getSession(params.sessionId);
      res.json(session);
    } catch (error) {
      next(error);
    }
  });

  router.post("/sessions/:sessionId/end", (req, res, next) => {
    try {
      const params = sessionPathSchema.parse(req.params ?? {});
      const ended = deps.sessionStore.endSession(params.sessionId);
      res.json({
        sessionId: ended.sessionId,
        status: ended.status,
        endedAt: ended.endedAt
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
