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
import { parseDomainSegment } from "../domain/contextBuilders";
import { logMeshEvent } from "../events/decisionLog";
import { requireActorId } from "../middleware/requireActor";
import { HttpError } from "../utils/errors";

const taskPathSchema = z.object({
  taskId: z.string().min(1)
});

const listQuerySchema = z.object({
  actorId: z.string().min(1)
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
      const tasks = listApprovalTasksForActor(query.actorId);
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

      setTaskApproved(taskId, approverActorId);
      const context = JSON.parse(task.contextJson) as Record<string, unknown>;
      const requestBody = JSON.parse(task.originalRequestBody) as Record<string, unknown>;

      const authorityDecision = await input.authorityClient.check({
        actorId: task.requestedBy,
        action: task.action,
        domain: task.domain,
        context
      });

      if (!authorityDecision.allowed) {
        setTaskRejected(taskId, approverActorId, "AuthorityDeniedOnRecheck");
        throw new HttpError(403, "recheck_denied", "Recheck denied by Authority Engine");
      }

      const governanceDecision = await input.governanceClient.evaluate({
        actorId: task.requestedBy,
        action: task.action,
        domain: parseDomainSegment(task.domain),
        context,
        authorityDecision
      });

      if (!governanceDecision.allowed || governanceDecision.requiresApproval || governanceDecision.escalatedToTier) {
        setTaskRejected(taskId, approverActorId, "GovernanceDeniedOnRecheck");
        throw new HttpError(403, "recheck_denied", "Recheck denied by Governance Engine");
      }

      const adapter = task.adapterId
        ? input.adapterRegistry.getById(task.adapterId)
        : input.adapterRegistry.resolve(task.meshActionPath);

      const upstream = await adapter.executeAction(task.meshActionPath, requestBody, {});
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
