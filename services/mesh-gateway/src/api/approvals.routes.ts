import { Router } from "express";
import { z } from "zod";
import { AdapterRegistry } from "../adapters/registry";
import { AuthorityClient } from "../clients/authorityClient";
import { GovernanceClient } from "../clients/governanceClient";
import {
  getApprovalTask,
  isActorAssigned,
  listApprovalTasksForActor,
  setTaskApproved,
  setTaskExecuted,
  setTaskRejected
} from "../domain/approvals";
import { buildDomainContext, canonicalResourceType } from "../domain/contextBuilders";
import { findGovernedOperation } from "../domain/governedOperations";
import { evaluatePipeline } from "../domain/pipeline";
import { adapterHeadersFromRequest } from "./adapterHeaders";
import { logMeshEvent } from "../events/decisionLog";
import { requireActorId } from "../middleware/requireActor";
import { HttpError } from "../utils/errors";

const taskPathSchema = z.object({
  taskId: z.string().min(1)
});

const listQuerySchema = z.object({
  actorId: z.string().min(1).optional()
});

export function createApprovalsRouter(input: {
  actorHeader: string;
  authorityClient: AuthorityClient;
  governanceClient: GovernanceClient;
  adapterRegistry: AdapterRegistry;
}) {
  const router = Router();

  router.get("/", (req, res, next) => {
    try {
      const query = listQuerySchema.parse(req.query);
      const actorId = requireActorId(req, input.actorHeader);
      if (query.actorId && query.actorId !== actorId) {
        throw new HttpError(403, "actor_mismatch", "Approvals can only be listed for the authenticated actor");
      }
      const tasks = listApprovalTasksForActor(actorId);
      res.json({ data: tasks });
    } catch (error) {
      next(error);
    }
  });

  router.post("/:taskId/reject", (req, res, next) => {
    try {
      const actorId = requireActorId(req, input.actorHeader);
      const { taskId } = taskPathSchema.parse(req.params);
      const task = getApprovalTask(taskId);
      if (!task) {
        throw new HttpError(404, "task_not_found", "Approval task not found");
      }

      if (task.status !== "PENDING") {
        throw new HttpError(409, "task_not_pending", `Task is ${task.status}`);
      }

      if (!isActorAssigned(taskId, actorId)) {
        throw new HttpError(403, "not_assigned", "Actor is not assigned to this task");
      }

      setTaskRejected(taskId, actorId, "RejectedByApprover");
      logMeshEvent({
        eventType: "MeshActionDenied",
        actorId,
        domain: task.domain,
        action: task.action,
        resource: task.resourceId,
        decision: "Rejected",
        reason: "RejectedByApprover",
        payload: { taskId }
      });

      res.json({ taskId, status: "REJECTED" });
    } catch (error) {
      next(error);
    }
  });

  router.post("/:taskId/approve", async (req, res, next) => {
    try {
      const approverActorId = requireActorId(req, input.actorHeader);
      const { taskId } = taskPathSchema.parse(req.params);
      const task = getApprovalTask(taskId);
      if (!task) {
        throw new HttpError(404, "task_not_found", "Approval task not found");
      }

      if (task.status !== "PENDING") {
        throw new HttpError(409, "task_not_pending", `Task is ${task.status}`);
      }

      if (!isActorAssigned(taskId, approverActorId)) {
        throw new HttpError(403, "not_assigned", "Actor is not assigned to this task");
      }

      const storedContext = JSON.parse(task.contextJson) as Record<string, unknown>;
      const requestBody = JSON.parse(task.originalRequestBody) as Record<string, unknown>;
      const adapter = input.adapterRegistry.getById(task.adapterId);

      // Re-evaluate as the approver (not the requester) against current resource state; the original
      // requester stays in the context so separation of duties still applies to the approver.
      let context = storedContext;
      const mcpMatch = /\/mcp\/([^/]+)$/.exec(task.meshActionPath);
      const opsMatch = /\/ops\/(.+)$/.exec(task.meshActionPath);
      if (task.action !== "create" && !mcpMatch && !opsMatch) {
        const meshResourcePath = task.meshActionPath.split("/").slice(0, 5).join("/");
        const current = await adapter.fetchResource(meshResourcePath, adapterHeadersFromRequest(req, { id: approverActorId }));
        context = buildDomainContext(task.domain, current.resource.attributes, approverActorId, {
          resourceType: canonicalResourceType(task.resourceType),
          action: task.action,
          body: requestBody
        });
      }

      const decision = await evaluatePipeline(
        { authorityClient: input.authorityClient, governanceClient: input.governanceClient },
        { actorId: approverActorId, action: task.action, domain: task.domain, context }
      );

      if (decision.outcome !== "allow") {
        const reason = decision.outcome === "deny" ? decision.reason : `RequiresTier${decision.requiredTier}`;
        logMeshEvent({
          eventType: "MeshActionDenied",
          actorId: approverActorId,
          domain: task.domain,
          action: task.action,
          resource: task.resourceId,
          decision: "ApproverNotPermitted",
          reason,
          payload: { taskId }
        });
        throw new HttpError(403, "recheck_denied", `Approver is not permitted to approve this task: ${reason}`);
      }

      setTaskApproved(taskId, approverActorId);

      const headers = adapterHeadersFromRequest(req, {
        id: approverActorId,
        tier: decision.authority.effectiveTier,
        governance: {
          outcome: "approved",
          approvalTaskId: taskId,
          requestedBy: task.requestedBy,
          approvedBy: approverActorId,
          riskLevel: decision.governance.riskLevel,
          matchedRules: decision.governance.matchedRules,
          action: task.action,
          resourceType: task.resourceType,
          resourceId: task.resourceId
        }
      });
      const op = opsMatch ? findGovernedOperation(opsMatch[1], requestBody) : null;
      if (opsMatch && !op) {
        throw new HttpError(409, "operation_not_governed", "Stored operation is no longer recognised");
      }
      const upstream = op
        ? await adapter.forward!(op.backendPath, requestBody, headers)
        : mcpMatch
        ? await adapter.invokeMcp!(decodeURIComponent(mcpMatch[1]), requestBody, headers)
        : task.action === "create"
          ? await adapter.createResource(task.meshActionPath, requestBody, headers)
          : await adapter.executeAction(task.meshActionPath, requestBody, headers);
      if (upstream.status >= 400) {
        setTaskRejected(taskId, approverActorId, "ExecutionFailedAfterApproval");
        throw new HttpError(502, "execution_failed", "Action failed when forwarded to backend adapter");
      }

      setTaskExecuted(taskId);
      logMeshEvent({
        eventType: "MeshApprovalCompleted",
        actorId: approverActorId,
        domain: task.domain,
        action: task.action,
        resource: task.resourceId,
        decision: "Executed",
        payload: { taskId, status: upstream.status }
      });

      res.json({
        taskId,
        status: "EXECUTED",
        result: upstream.data
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
