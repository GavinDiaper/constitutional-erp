import { Router } from "express";
import { z } from "zod";
import { CaiplService } from "../services/caiplService";

const createSessionSchema = z.object({
  userId: z.string().min(1),
  currentGoal: z.string().trim().min(1).max(4000)
});

const turnSchema = z.object({
  actor: z.union([z.literal("user"), z.literal("ai"), z.literal("system")]),
  messageText: z.string().trim().min(1).max(4000),
  sessionVersion: z.number().int().nonnegative()
});

const decisionResolveSchema = z.object({
  action: z.union([
    z.literal("confirm"),
    z.literal("reject"),
    z.literal("amend"),
    z.literal("retry"),
    z.literal("escalate")
  ]),
  actorId: z.string().min(1),
  note: z.string().trim().max(4000).optional(),
  formInput: z.record(z.unknown()).optional(),
  optionId: z.string().min(1).optional(),
  sessionVersion: z.number().int().nonnegative(),
  decisionVersion: z.number().int().nonnegative()
});

function versionMismatchResponse(input: {
  scope: "session" | "decision";
  currentVersion: number;
  sessionId?: string;
  decisionId?: string;
}) {
  return {
    error: "VERSION_MISMATCH",
    message: "The decision or session has already been updated.",
    scope: input.scope,
    currentVersion: input.currentVersion,
    sessionId: input.sessionId,
    decisionId: input.decisionId
  };
}

export function createCaiplRouter(service: CaiplService) {
  const router = Router();

  router.post("/caipl/session", (req, res, next) => {
    try {
      const body = createSessionSchema.parse(req.body ?? {});
      const result = service.createSession(body);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  });

  router.get("/caipl/session/:id", (req, res, next) => {
    try {
      const sessionId = z.string().uuid().parse(req.params.id);
      const result = service.getSession(sessionId);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  router.post("/caipl/session/:id/turn", (req, res, next) => {
    try {
      const sessionId = z.string().uuid().parse(req.params.id);
      const body = turnSchema.parse(req.body ?? {});
      const result = service.submitTurn(sessionId, body);

      if ("conflict" in result) {
        res.status(409).json(versionMismatchResponse(result.conflict));
        return;
      }

      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  router.post("/caipl/decision/:id/resolve", (req, res, next) => {
    try {
      const decisionId = z.string().uuid().parse(req.params.id);
      const body = decisionResolveSchema.parse(req.body ?? {});
      const result = service.resolveDecision(decisionId, body);

      if ("conflict" in result) {
        res.status(409).json(versionMismatchResponse(result.conflict));
        return;
      }

      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
