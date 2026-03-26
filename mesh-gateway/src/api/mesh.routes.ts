import { Router } from "express";
import { z } from "zod";
import { AuthorityClient } from "../clients/authorityClient";
import { FoundationErpClient } from "../clients/foundationErpClient";
import { GovernanceClient } from "../clients/governanceClient";
import { createApprovalTask } from "../domain/approvals";
import { buildDomainContext, parseDomainSegment } from "../domain/contextBuilders";
import { buildRequestFingerprint } from "../domain/fingerprint";
import { AuthorityDomain, LinkDef } from "../domain/types";
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

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function asLinks(value: unknown): Record<string, LinkDef> {
  const raw = asRecord(value);
  const links: Record<string, LinkDef> = {};

  for (const [key, candidate] of Object.entries(raw)) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      continue;
    }

    const c = candidate as Record<string, unknown>;
    const method = String(c.method ?? "GET").toUpperCase();
    if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method)) {
      continue;
    }

    links[key] = {
      href: String(c.href ?? ""),
      method: method as LinkDef["method"]
    };
  }

  return links;
}

export function createMeshRouter(input: {
  actorHeader: string;
  authorityClient: AuthorityClient;
  governanceClient: GovernanceClient;
  foundationClient: FoundationErpClient;
}) {
  const router = Router();

  router.get("/:domain/:resource/:id", async (req, res, next) => {
    try {
      const actorId = requireActorId(req, input.actorHeader);
      const params = pathSchema.parse(req.params);
      const domain = parseDomainSegment(params.domain);
      const foundationPath = `/api/v1/${params.domain}/${params.resource}/${params.id}`;

      const upstream = await input.foundationClient.getResource(foundationPath);
      const entity = asRecord(upstream.data);
      const context = buildDomainContext(domain, entity, actorId);
      const links = asLinks(entity._links);
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

      entity._links = filtered;

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

      res.status(upstream.status).json(entity);
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

      const foundationResourcePath = `/api/v1/${params.domain}/${params.resource}/${params.id}`;
      const foundationActionPath = `${foundationResourcePath}/${action}`;

      const resourceResponse = await input.foundationClient.getResource(foundationResourcePath);
      const context = buildDomainContext(domain, asRecord(resourceResponse.data), actorId);

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
          resourceId,
          action,
          requiredTier: governanceDecision.requiredApproverTier,
          escalatedToTier: governanceDecision.escalatedToTier,
          requestPath: foundationActionPath,
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

      const upstream = await input.foundationClient.postAction(foundationActionPath, requestBody);

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
