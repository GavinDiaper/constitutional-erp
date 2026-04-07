import { Request, Router } from "express";
import { z } from "zod";
import { ProcessFacade } from "../domain/processFacade";
import { SessionStore } from "../domain/sessionStore";
import { McpCatalog } from "../domain/mcpCatalog";
import { HubNavlogEntry, SessionMode } from "../domain/types";
import { AppConfig } from "../config/env";
import { requestJson } from "../clients/http";

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

const createOperationSchema = z.union([
  z.literal("create-supplier"),
  z.literal("create-requisition"),
  z.literal("create-purchase-order"),
  z.literal("create-fiscal-year"),
  z.literal("create-fiscal-period"),
  z.literal("create-payment")
]);

const lookupKindSchema = z.union([
  z.literal("suppliers"),
  z.literal("ledgers"),
  z.literal("fiscal-years"),
  z.literal("invoices")
]);

type CreateOperation = z.infer<typeof createOperationSchema>;
type LookupKind = z.infer<typeof lookupKindSchema>;

const CREATE_OPERATION_CONFIG: Record<
  CreateOperation,
  { route: string; entityType: string; entityIdField: string }
> = {
  "create-supplier": {
    route: "/api/v1/p2p/suppliers",
    entityType: "p2p_supplier",
    entityIdField: "supplier_id"
  },
  "create-requisition": {
    route: "/api/v1/p2p/requisitions",
    entityType: "p2p_requisition",
    entityIdField: "requisition_id"
  },
  "create-purchase-order": {
    route: "/api/v1/p2p/purchase-orders",
    entityType: "p2p_purchase_order",
    entityIdField: "po_id"
  },
  "create-fiscal-year": {
    route: "/api/v1/r2r/fiscal-years",
    entityType: "r2r_fiscal_year",
    entityIdField: "fiscal_year_id"
  },
  "create-fiscal-period": {
    route: "/api/v1/r2r/fiscal-periods",
    entityType: "r2r_fiscal_period",
    entityIdField: "fiscal_period_id"
  },
  "create-payment": {
    route: "/api/v1/o2c/payments",
    entityType: "o2c_payment",
    entityIdField: "payment_id"
  }
};

const LOOKUP_ROUTE_CONFIG: Record<LookupKind, string> = {
  suppliers: "/api/v1/query/p2p_supplier",
  ledgers: "/api/v1/query/r2r_ledger",
  "fiscal-years": "/api/v1/query/r2r_fiscal_year",
  invoices: "/api/v1/query/o2c_invoice"
};

function foundationHeaders(req: Request, config: AppConfig): Record<string, string> {
  const actorId = req.header("x-actor-id") ?? "principal.system";
  const actorTier = req.header("x-actor-tier") ?? "5";

  return {
    "accept": "application/json",
    "x-api-key": config.foundationErpApiKey,
    [config.foundationErpIngressIdHeader]: config.foundationErpIngressId,
    "x-actor-id": actorId,
    "x-actor-tier": actorTier
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function normalizeLookupRows(kind: LookupKind, rows: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  if (kind === "suppliers") {
    return rows.filter((row) => String(row.status ?? "").toLowerCase() !== "inactive");
  }

  if (kind === "invoices") {
    return rows.filter((row) => {
      const state = String(row.state ?? "").toLowerCase();
      const amountDue = Number(row.amount_due ?? 0);
      const amountPaid = Number(row.amount_paid ?? 0);
      if (Number.isFinite(amountDue) && Number.isFinite(amountPaid)) {
        return amountDue > amountPaid;
      }

      return state !== "paid";
    });
  }

  return rows;
}

export function createHubRouter(deps: {
  processFacade: ProcessFacade;
  catalog: McpCatalog;
  sessionStore: SessionStore;
  config: AppConfig;
}) {
  const router = Router();

  router.get("/lookups/p2p/suppliers", async (req, res, next) => {
    try {
      const activeOnly = String(req.query.activeOnly ?? "false").toLowerCase() === "true";
      const upstream = await requestJson<{ data?: Array<Record<string, unknown>> }>(
        `${deps.config.foundationErpUrl}/api/v1/p2p/suppliers`,
        {
          method: "GET",
          headers: foundationHeaders(req, deps.config)
        }
      );

      const suppliers = Array.isArray(upstream?.data) ? upstream.data : [];
      const filtered = activeOnly
        ? suppliers.filter((row) => String(row.status ?? "").toLowerCase() === "active")
        : suppliers;

      res.json({ data: filtered });
    } catch (error) {
      next(error);
    }
  });

  router.get("/create/lookups/:kind", async (req, res, next) => {
    try {
      const kind = lookupKindSchema.parse(req.params.kind);
      const route = LOOKUP_ROUTE_CONFIG[kind];
      const upstream = await requestJson<{ data?: Array<Record<string, unknown>> }>(
        `${deps.config.foundationErpUrl}${route}`,
        {
          method: "GET",
          headers: foundationHeaders(req, deps.config)
        }
      );

      const rows = Array.isArray(upstream.data) ? upstream.data : [];
      res.json({ data: normalizeLookupRows(kind, rows) });
    } catch (error) {
      next(error);
    }
  });

  router.post("/create/:operation", async (req, res, next) => {
    try {
      const operation = createOperationSchema.parse(req.params.operation);
      const config = CREATE_OPERATION_CONFIG[operation];
      const payload = asRecord(req.body ?? {});
      const created = await requestJson<Record<string, unknown>>(
        `${deps.config.foundationErpUrl}${config.route}`,
        {
          method: "POST",
          headers: {
            ...foundationHeaders(req, deps.config),
            "content-type": "application/json"
          },
          body: JSON.stringify(payload)
        }
      );

      res.status(201).json({
        operation,
        entityType: config.entityType,
        entityId: String(created[config.entityIdField] ?? ""),
        data: created
      });
    } catch (error) {
      next(error);
    }
  });

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
