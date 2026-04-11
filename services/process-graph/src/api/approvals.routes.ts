import { Router } from "express";
import { z } from "zod";
import { loadConfig } from "../config/env";
import { appendCommandLog, getApprovalTask, listPendingApprovalTasks, resolveApprovalTask } from "../domain/commandStore";
import { evaluateTransition } from "../domain/policy/evaluateTransition";
import { rebuildAggregate } from "../domain/replay/rebuildAggregate";
import { findTransition, getAvailableTransitions } from "../domain/transitions/registry";
import { CanonicalDomain, CanonicalLink } from "../contracts/canonicalTypes";
import { HttpError } from "../utils/errors";

function addSupplementalLinks(
  links: Record<string, CanonicalLink>,
  domain: CanonicalDomain,
  aggregateType: string,
  aggregateId: string,
  state: string
): void {
  if (domain !== "P2P" || state !== "Draft") {
    return;
  }

  if (aggregateType === "requisition" || aggregateType === "purchase-order") {
    links["add-line"] = {
      href: `/graph/${domain.toLowerCase()}/${aggregateType}/${aggregateId}/add-line`,
      method: "POST",
      rel: "update"
    };
  }
}

const listQuerySchema = z.object({
  domain: z.union([z.literal("P2P"), z.literal("O2C"), z.literal("R2R"), z.literal("H2R")]).optional(),
  aggregateType: z.string().min(1).optional(),
  aggregateId: z.string().min(1).optional()
});

const resolveBodySchema = z.object({
  resolution: z.union([z.literal("Approved"), z.literal("Rejected")]),
  note: z.string().optional()
});

export const approvalsRouter = Router();

// ── GET /graph/approvals ──────────────────────────────────────────────────────
approvalsRouter.get("/", (req, res, next) => {
  try {
    const query = listQuerySchema.parse(req.query);
    const tasks = listPendingApprovalTasks({
      domain: query.domain as CanonicalDomain | undefined,
      aggregateType: query.aggregateType,
      aggregateId: query.aggregateId
    });

    res.json({ data: tasks });
  } catch (error) {
    next(error);
  }
});

// ── GET /graph/approvals/:taskId ──────────────────────────────────────────────
approvalsRouter.get("/:taskId", (req, res, next) => {
  try {
    const task = getApprovalTask(req.params["taskId"] as string);
    if (!task) throw new HttpError(404, "approval_task_not_found", "Approval task not found");
    res.json(task);
  } catch (error) {
    next(error);
  }
});

// ── POST /graph/approvals/:taskId/resolve ─────────────────────────────────────
// Approve or reject a pending approval task.
// If approved, execute the transition (record command + optionally delegate to Mesh).
approvalsRouter.post("/:taskId/resolve", async (req, res, next) => {
  try {
    const taskId = z.string().min(1).parse(req.params["taskId"]);
    const approverId = req.header("x-actor-id");
    if (!approverId) {
      throw new HttpError(400, "missing_actor", "Header x-actor-id is required");
    }

    const body = resolveBodySchema.parse(req.body);
    const task = getApprovalTask(taskId);
    if (!task) throw new HttpError(404, "approval_task_not_found", "Approval task not found");
    if (task.status !== "Pending") {
      throw new HttpError(409, "approval_task_already_resolved", `Approval task is already ${task.status}`);
    }

    const resolved = resolveApprovalTask(taskId, body.resolution, approverId, body.note);
    if (!resolved) {
      throw new HttpError(409, "approval_task_conflict", "Approval task could not be resolved");
    }

    if (body.resolution === "Rejected") {
      res.json({ status: "rejected", task: resolved });
      return;
    }

    // Approved: execute the transition
    const { domain, aggregateType, aggregateId, action, actorId, payload } = task;

    const aggregate = await rebuildAggregate(domain, aggregateType, aggregateId);
    const transition = findTransition(domain, aggregateType, action);

    if (!transition || !transition.fromStates.includes(aggregate.state)) {
      // State changed while approval was pending
      res.status(409).json({
        type: "https://process-graph.local/problems/stale_approval",
        title: "stale_approval",
        status: 409,
        detail: `Aggregate state changed since approval was submitted; current state is '${aggregate.state}'`,
        task: resolved
      });
      return;
    }

    // Re-evaluate charter with the approver's identity to confirm authority
    const outcome = await evaluateTransition({ actorId: approverId, action, domain, aggregate, payload });
    if (outcome.kind === "denied") {
      res.status(403).json({
        type: "https://process-graph.local/problems/approver_denied",
        title: "approver_denied",
        status: 403,
        detail: "Approver does not have sufficient authority for this transition",
        reasons: outcome.kind === "denied" ? outcome.reasons : [],
        task: resolved
      });
      return;
    }

    const projectedState =
      typeof payload["projectedState"] === "string"
        ? (payload["projectedState"] as string)
        : (transition.toStates[0] ?? aggregate.state);

    const config = loadConfig();
    let meshDelegated = false;

    if (config.meshDelegationEnabled && typeof payload["adapterId"] === "string") {
      const { delegateToMesh } = await import("../clients/meshClient");
      const meshResult = await delegateToMesh({
        adapterId: payload["adapterId"] as string,
        domain: domain.toLowerCase(),
        resource: aggregateType,
        id: aggregateId,
        action,
        actorId,
        payload
      });
      meshDelegated = meshResult.success;
    }

    appendCommandLog({ domain, aggregateType, aggregateId, action, actorId, projectedState, payload, meshDelegated });

    const nextLinks: Record<string, CanonicalLink> = {
      self: {
        href: `/graph/${domain.toLowerCase()}/${aggregateType}/${aggregateId}`,
        method: "GET",
        rel: "self"
      }
    };
    for (const t of getAvailableTransitions(domain, aggregateType, projectedState)) {
      nextLinks[t.action] = {
        href: `/graph/${domain.toLowerCase()}/${aggregateType}/${aggregateId}/${t.action}`,
        method: "POST",
        rel: "transition"
      };
    }

    addSupplementalLinks(nextLinks, domain, aggregateType, aggregateId, projectedState);

    res.json({
      status: "approved_and_executed",
      task: resolved,
      resource: {
        id: aggregateId,
        domain,
        type: aggregateType,
        state: projectedState,
        attributes: { ...aggregate.attributes, ...payload },
        links: nextLinks
      }
    });
  } catch (error) {
    next(error);
  }
});
