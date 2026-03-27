import { Router } from "express";
import { z } from "zod";
import { AdapterRegistry } from "../adapters/registry";
import { AuthorityClient } from "../clients/authorityClient";
import { GovernanceClient } from "../clients/governanceClient";
import { createApprovalTask } from "../domain/approvals";
import { buildDomainContext, parseDomainSegment } from "../domain/contextBuilders";
import { buildRequestFingerprint } from "../domain/fingerprint";
import { LinkDef } from "../domain/types";
import { logMeshEvent } from "../events/decisionLog";
import { requireActorId } from "../middleware/requireActor";
import { HttpError } from "../utils/errors";

const pathSchema = z.object({
  domain: z.string().min(1),
  resource: z.string().min(1),
  id: z.string().min(1)
});

const actionPathSchema = pathSchema.extend({
  action: z.string().min(1)
});

export function createMeshRouter(input: {
  actorHeader: string;
  authorityClient: AuthorityClient;
  governanceClient: GovernanceClient;
  adapterRegistry: AdapterRegistry;
}) {
  const router = Router();

  router.get("/:domain/:resource/:id", async (req, res, next) => {
    try {
      const actorId = requireActorId(req, input.actorHeader);
      const params = pathSchema.parse(req.params);
      const domain = parseDomainSegment(params.domain);
      const meshResourcePath = `/mesh/${params.domain}/${params.resource}/${params.id}`;
      const adapter = input.adapterRegistry.resolve(meshResourcePath);

      const upstream = await adapter.fetchResource(meshResourcePath, {});
      const context = buildDomainContext(domain, upstream.resource.attributes, actorId);
      const links = upstream.resource.links;
      const filtered: Record<string, LinkDef> = {};
      const removedTransitions: string[] = [];

      for (const [transition, link] of Object.entries(links)) {
        try {
          const authorityDecision = await input.authorityClient.check({
            actorId,
            action: transition,
            domain,
            context
          });

          if (!authorityDecision.allowed) {
            removedTransitions.push(transition);
            continue;
          }

          const governanceDecision = await input.governanceClient.evaluate({
            actorId,
            action: transition,
            domain,
            context,
            authorityDecision
          });

          if (!governanceDecision.allowed) {
            removedTransitions.push(transition);
            continue;
          }

          const href = link.href.startsWith("/api/v1/") ? link.href.replace("/api/v1/", "/mesh/") : link.href;
          filtered[transition] = {
            href,
            method: link.method,
            requiresApproval: governanceDecision.requiresApproval,
            requiredApproverTier: governanceDecision.requiredApproverTier,
            escalatedToTier: governanceDecision.escalatedToTier
          };
        } catch {
          removedTransitions.push(transition);
        }
      }

      upstream.resource.links = filtered;

      logMeshEvent({
        eventType: "MeshHypermediaFiltered",
        actorId,
        domain,
        action: "READ",
        resource: `${params.resource}/${params.id}`,
        decision: "Filtered",
        payload: {
          removedTransitions
        }
      });

      res.status(upstream.status).json(upstream.resource);
    } catch (error) {
      next(error);
    }
  });

  router.post("/:domain/:resource/:id/:action", async (req, res, next) => {
    try {
      const actorId = requireActorId(req, input.actorHeader);
      const params = actionPathSchema.parse(req.params);
      const domain = parseDomainSegment(params.domain);
      const resourceId = params.id;
      const action = params.action;
      const requestBody = req.body ?? {};
      const meshResourcePath = `/mesh/${params.domain}/${params.resource}/${params.id}`;
      const meshActionPath = `${meshResourcePath}/${action}`;
      const adapter = input.adapterRegistry.resolve(meshActionPath);

      const resourceResponse = await adapter.fetchResource(meshResourcePath, {});
      const context = buildDomainContext(domain, resourceResponse.resource.attributes, actorId);

      const authorityDecision = await input.authorityClient.check({
        actorId,
        action,
        domain,
        context
      });

      if (!authorityDecision.allowed) {
        logMeshEvent({
          eventType: "MeshActionDenied",
          actorId,
          domain,
          action,
          resource: `${params.resource}/${resourceId}`,
          decision: "Denied",
          reason: authorityDecision.reasons.join(",") || "AuthorityDenied",
          payload: { authorityDecision }
        });

        throw new HttpError(403, "action_denied", "Action denied by Authority Engine");
      }

      const governanceDecision = await input.governanceClient.evaluate({
        actorId,
        action,
        domain,
        context,
        authorityDecision
      });

      if (!governanceDecision.allowed) {
        logMeshEvent({
          eventType: "MeshActionDenied",
          actorId,
          domain,
          action,
          resource: `${params.resource}/${resourceId}`,
          decision: "Denied",
          reason: governanceDecision.violations.join(",") || "GovernanceDenied",
          payload: { governanceDecision }
        });

        throw new HttpError(403, "action_denied", "Action denied by Governance Engine");
      }

      if (governanceDecision.requiresApproval || governanceDecision.escalatedToTier) {
        const requiredTier = governanceDecision.requiredApproverTier ?? governanceDecision.escalatedToTier ?? 1;
        const approvers = await input.authorityClient.getEligibleApprovers(domain, requiredTier);
        const requestFingerprint = buildRequestFingerprint({
          actorId,
          action,
          domain,
          resourceId,
          body: requestBody
        });

        const created = createApprovalTask({
          actorId,
          domain,
          resourceType: params.resource,
          resourceId,
          action,
          adapterId: adapter.id,
          meshActionPath,
          requiredTier: governanceDecision.requiredApproverTier,
          escalatedToTier: governanceDecision.escalatedToTier,
          requestBody,
          context,
          decisionSnapshot: { authorityDecision, governanceDecision },
          approvers,
          requestFingerprint
        });

        logMeshEvent({
          eventType: "MeshApprovalTaskCreated",
          actorId,
          domain,
          action,
          resource: `${params.resource}/${resourceId}`,
          decision: "ApprovalRequired",
          payload: {
            taskId: created.taskId,
            requiredTier,
            approvers,
            requestFingerprint
          }
        });

        res.status(202).json({
          taskId: created.taskId,
          status: "PENDING",
          requiredTier,
          approvers,
          requestFingerprint
        });
        return;
      }

      const upstream = await adapter.executeAction(meshActionPath, requestBody, {});

      logMeshEvent({
        eventType: "MeshActionAllowed",
        actorId,
        domain,
        action,
        resource: `${params.resource}/${resourceId}`,
        decision: upstream.status < 400 ? "Executed" : "ForwardedWithError",
        payload: {
          status: upstream.status
        }
      });

      res.status(upstream.status).json(upstream.data);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
