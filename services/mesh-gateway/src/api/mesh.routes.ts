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

type ExplicitResourceParams = z.infer<typeof explicitPathSchema>;
type ExplicitActionParams = z.infer<typeof explicitActionPathSchema>;
type ResourceParams = ExplicitResourceParams;
type ActionParams = ExplicitActionParams;

const explicitPathSchema = z.object({
  adapterId: z.string().min(1),
  domain: z.string().min(1),
  resource: z.string().min(1),
  id: z.string().min(1)
});

const explicitActionPathSchema = explicitPathSchema.extend({
  action: z.string().min(1)
});

function parseResourceRequest(params: Record<string, string>): ResourceParams {
  return explicitPathSchema.parse(params);
}

function parseActionRequest(params: Record<string, string>): ActionParams {
  return explicitActionPathSchema.parse(params);
}

function buildMeshResourcePath(input: {
  adapterId: string;
  domain: string;
  resource: string;
  id: string;
}) {
  return `/mesh/${input.adapterId}/${input.domain}/${input.resource}/${input.id}`;
}

function buildMeshActionPath(input: {
  adapterId: string;
  domain: string;
  resource: string;
  id: string;
  action: string;
}) {
  const resourcePath = buildMeshResourcePath(input);
  return `${resourcePath}/${input.action}`;
}

function adapterHeadersFromRequest(req: any): Record<string, string> {
  const headers: Record<string, string> = {};
  const values: Array<[string, string | undefined]> = [
    ["authorization", req.header("authorization") ?? undefined],
    ["x-actor-id", req.header("x-actor-id") ?? undefined],
    ["x-actor-tier", req.header("x-actor-tier") ?? undefined],
    ["x-actor-email", req.header("x-actor-email") ?? undefined],
    ["x-actor-h2r-employee-id", req.header("x-actor-h2r-employee-id") ?? undefined]
  ];

  for (const [key, value] of values) {
    if (value && value.trim()) {
      headers[key] = value;
    }
  }

  return headers;
}

export function createMeshRouter(input: {
  actorHeader: string;
  authorityClient: AuthorityClient;
  governanceClient: GovernanceClient;
  adapterRegistry: AdapterRegistry;
}) {
  const router = Router();

  const handleGet = async (req: any, res: any, next: any) => {
    try {
      const actorId = requireActorId(req, input.actorHeader);
      const params = parseResourceRequest(req.params as Record<string, string>);
      const domain = parseDomainSegment(params.domain);
      const meshResourcePath = buildMeshResourcePath(params);
      const adapter = input.adapterRegistry.resolve(meshResourcePath, params.adapterId);

      const upstream = await adapter.fetchResource(meshResourcePath, adapterHeadersFromRequest(req));
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

          filtered[transition] = {
            href: link.href,
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
          adapterId: adapter.id,
          removedTransitions
        }
      });

      res.status(upstream.status).json(upstream.resource);
    } catch (error) {
      next(error);
    }
  };

  const handlePost = async (req: any, res: any, next: any) => {
    try {
      const actorId = requireActorId(req, input.actorHeader);
      const params = parseActionRequest(req.params as Record<string, string>);
      const domain = parseDomainSegment(params.domain);
      const resourceId = params.id;
      const action = params.action;
      const requestBody = req.body ?? {};
      const meshResourcePath = buildMeshResourcePath(params);
      const meshActionPath = buildMeshActionPath(params);
      const adapter = input.adapterRegistry.resolve(meshActionPath, params.adapterId);

      const resourceResponse = await adapter.fetchResource(meshResourcePath, adapterHeadersFromRequest(req));
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
          payload: { adapterId: adapter.id, authorityDecision }
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
          payload: { adapterId: adapter.id, governanceDecision }
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
            adapterId: adapter.id,
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
          requestFingerprint,
          adapterId: adapter.id
        });
        return;
      }

      const upstream = await adapter.executeAction(meshActionPath, requestBody, adapterHeadersFromRequest(req));

      logMeshEvent({
        eventType: "MeshActionAllowed",
        actorId,
        domain,
        action,
        resource: `${params.resource}/${resourceId}`,
        decision: upstream.status < 400 ? "Executed" : "ForwardedWithError",
        payload: {
          adapterId: adapter.id,
          status: upstream.status
        }
      });

      res.status(upstream.status).json(upstream.data);
    } catch (error) {
      next(error);
    }
  };

  router.get("/:adapterId/:domain/:resource/:id", handleGet);
  router.post("/:adapterId/:domain/:resource/:id/:action", handlePost);

  return router;
}
