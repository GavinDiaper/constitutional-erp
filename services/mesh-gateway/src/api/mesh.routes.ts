import { Router } from "express";
import { z } from "zod";
import { AdapterRegistry } from "../adapters/registry";
import { AuthorityClient } from "../clients/authorityClient";
import { GovernanceClient } from "../clients/governanceClient";
import { createApprovalTask, findPendingTaskByFingerprint } from "../domain/approvals";
import { buildDomainContext, canonicalResourceType, parseDomainSegment } from "../domain/contextBuilders";
import { findGovernedOperation } from "../domain/governedOperations";
import { buildRequestFingerprint } from "../domain/fingerprint";
import { evaluatePipeline, PipelineDecision } from "../domain/pipeline";
import { AuthorityDomain, LinkDef } from "../domain/types";
import { logMeshEvent } from "../events/decisionLog";
import { requireActorId } from "../middleware/requireActor";
import { HttpError } from "../utils/errors";
import { adapterHeadersFromRequest } from "./adapterHeaders";

const collectionPathSchema = z.object({
  adapterId: z.string().min(1),
  domain: z.string().min(1),
  resource: z.string().min(1)
});

const explicitPathSchema = collectionPathSchema.extend({
  id: z.string().min(1)
});

const explicitActionPathSchema = explicitPathSchema.extend({
  action: z.string().min(1)
});

function buildMeshCollectionPath(input: { adapterId: string; domain: string; resource: string }) {
  return `/mesh/${input.adapterId}/${input.domain}/${input.resource}`;
}

function buildMeshResourcePath(input: { adapterId: string; domain: string; resource: string; id: string }) {
  return `${buildMeshCollectionPath(input)}/${input.id}`;
}

export function createMeshRouter(input: {
  actorHeader: string;
  authorityClient: AuthorityClient;
  governanceClient: GovernanceClient;
  adapterRegistry: AdapterRegistry;
  enforcementMode?: "enforce" | "shadow";
}) {
  const router = Router();
  const shadow = input.enforcementMode === "shadow";
  const clients = { authorityClient: input.authorityClient, governanceClient: input.governanceClient };

  // In shadow mode decisions are recorded but never block, so rules can be validated against real traffic first.
  const logShadow = (decision: PipelineDecision, actorId: string, domain: AuthorityDomain, action: string, resource: string) => {
    if (decision.outcome === "allow") {
      return;
    }

    logMeshEvent({
      eventType: "MeshShadowDecision",
      actorId,
      domain,
      action,
      resource,
      decision: decision.outcome === "deny" ? "WouldDeny" : "WouldRequireApproval",
      reason: decision.outcome === "deny" ? decision.reason : `RequiredTier:${decision.requiredTier}`,
      payload: { decision }
    });
  };

  const handleGet = async (req: any, res: any, next: any) => {
    try {
      const actorId = requireActorId(req, input.actorHeader);
      const params = explicitPathSchema.parse(req.params as Record<string, string>);
      const domain = parseDomainSegment(params.domain);
      const resourceType = canonicalResourceType(params.resource);
      const meshResourcePath = buildMeshResourcePath(params);
      const adapter = input.adapterRegistry.resolve(meshResourcePath, params.adapterId);

      const upstream = await adapter.fetchResource(meshResourcePath, adapterHeadersFromRequest(req, { id: actorId }));
      const filtered: Record<string, LinkDef> = {};
      const removedTransitions: string[] = [];

      for (const [transition, link] of Object.entries(upstream.resource.links)) {
        try {
          const context = buildDomainContext(domain, upstream.resource.attributes, actorId, { resourceType, action: transition });
          const decision = await evaluatePipeline(clients, { actorId, action: transition, domain, context });

          if (decision.outcome === "deny" && !shadow) {
            removedTransitions.push(transition);
            continue;
          }

          const governance = decision.outcome === "deny" ? undefined : decision.governance;
          filtered[transition] = {
            href: link.href,
            method: link.method,
            requiresApproval: decision.outcome === "approval" ? true : governance?.requiresApproval,
            requiredApproverTier: decision.outcome === "approval" ? decision.requiredTier : governance?.requiredApproverTier,
            escalatedToTier: governance?.escalatedToTier,
            riskLevel: governance?.riskLevel
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

  // Shared tail of create/action: apply the decision, then either park for approval or forward to the adapter.
  const enforceAndExecute = async (args: {
    req: any;
    res: any;
    actorId: string;
    domain: AuthorityDomain;
    action: string;
    resourceType: string;
    resourceId: string;
    adapterId: string;
    meshPath: string;
    requestBody: unknown;
    context: Record<string, unknown>;
    decision: PipelineDecision;
    execute: (headers: Record<string, string>) => Promise<{ status: number; data: unknown }>;
  }) => {
    const { req, res, actorId, domain, action, resourceType, resourceId, decision } = args;
    const resourceLabel = `${args.resourceType}/${resourceId}`;

    if (shadow) {
      logShadow(decision, actorId, domain, action, resourceLabel);
    } else if (decision.outcome === "deny") {
      logMeshEvent({
        eventType: "MeshActionDenied",
        actorId,
        domain,
        action,
        resource: resourceLabel,
        decision: "Denied",
        reason: decision.reason,
        payload: { adapterId: args.adapterId, authorityDecision: decision.authority, governanceDecision: decision.governance }
      });

      throw new HttpError(
        403,
        "action_denied",
        decision.stage === "authority" ? "Action denied by Authority Engine" : "Action denied by Governance Engine"
      );
    } else if (decision.outcome === "approval") {
      const approvers = await input.authorityClient.getEligibleApprovers(domain, decision.requiredTier);
      const requestFingerprint = buildRequestFingerprint({
        actorId,
        action,
        domain,
        resourceId,
        body: args.requestBody
      });

      const existing = findPendingTaskByFingerprint(requestFingerprint);
      const created =
        existing ??
        createApprovalTask({
          actorId,
          domain,
          resourceType,
          resourceId,
          action,
          adapterId: args.adapterId,
          meshActionPath: args.meshPath,
          requiredTier: decision.governance.requiredApproverTier,
          escalatedToTier: decision.governance.escalatedToTier,
          requestBody: args.requestBody,
          context: args.context,
          decisionSnapshot: { authorityDecision: decision.authority, governanceDecision: decision.governance },
          approvers,
          requestFingerprint
        });

      if (!existing) {
        logMeshEvent({
          eventType: "MeshApprovalTaskCreated",
          actorId,
          domain,
          action,
          resource: resourceLabel,
          decision: "ApprovalRequired",
          payload: {
            adapterId: args.adapterId,
            taskId: created.taskId,
            requiredTier: decision.requiredTier,
            approvers,
            requestFingerprint
          }
        });
      }

      res.status(202).json({
        taskId: created.taskId,
        status: "PENDING",
        requiredTier: decision.requiredTier,
        riskLevel: decision.governance.riskLevel,
        approvers,
        requestFingerprint,
        adapterId: args.adapterId
      });
      return;
    }

    const effectiveTier = decision.authority.effectiveTier;
    const governance = {
      outcome: decision.outcome,
      mode: shadow ? "shadow" : "enforce",
      riskLevel: decision.governance?.riskLevel,
      matchedRules: decision.governance?.matchedRules,
      requesterId: args.context.requesterId,
      action,
      resourceType,
      resourceId
    };
    const upstream = await args.execute(adapterHeadersFromRequest(req, { id: actorId, tier: effectiveTier, governance }));

    logMeshEvent({
      eventType: "MeshActionAllowed",
      actorId,
      domain,
      action,
      resource: resourceLabel,
      decision: upstream.status < 400 ? "Executed" : "ForwardedWithError",
      payload: {
        adapterId: args.adapterId,
        status: upstream.status,
        governance: decision.outcome === "allow" ? { riskLevel: decision.governance.riskLevel } : undefined
      }
    });

    res.status(upstream.status).json(upstream.data);
  };

  const handlePost = async (req: any, res: any, next: any) => {
    try {
      const actorId = requireActorId(req, input.actorHeader);
      const params = explicitActionPathSchema.parse(req.params as Record<string, string>);
      const domain = parseDomainSegment(params.domain);
      const resourceType = canonicalResourceType(params.resource);
      const requestBody = req.body ?? {};
      const meshResourcePath = buildMeshResourcePath(params);
      const meshActionPath = `${meshResourcePath}/${params.action}`;
      const adapter = input.adapterRegistry.resolve(meshActionPath, params.adapterId);

      const resourceResponse = await adapter.fetchResource(meshResourcePath, adapterHeadersFromRequest(req, { id: actorId }));
      const context = buildDomainContext(domain, resourceResponse.resource.attributes, actorId, {
        resourceType,
        action: params.action,
        body: requestBody
      });
      const decision = await evaluatePipeline(clients, { actorId, action: params.action, domain, context });

      await enforceAndExecute({
        req,
        res,
        actorId,
        domain,
        action: params.action,
        resourceType: params.resource,
        resourceId: params.id,
        adapterId: adapter.id,
        meshPath: meshActionPath,
        requestBody,
        context,
        decision,
        execute: (headers) => adapter.executeAction(meshActionPath, requestBody, headers)
      });
    } catch (error) {
      next(error);
    }
  };

  const handleCreate = async (req: any, res: any, next: any) => {
    try {
      const actorId = requireActorId(req, input.actorHeader);
      const params = collectionPathSchema.parse(req.params as Record<string, string>);
      const domain = parseDomainSegment(params.domain);
      const resourceType = canonicalResourceType(params.resource);
      const requestBody = req.body ?? {};
      const meshPath = buildMeshCollectionPath(params);
      const adapter = input.adapterRegistry.resolve(meshPath, params.adapterId);

      const context = buildDomainContext(domain, requestBody, actorId, { resourceType, action: "create", body: requestBody });
      context.requesterId = actorId;
      const decision = await evaluatePipeline(clients, { actorId, action: "create", domain, context });

      await enforceAndExecute({
        req,
        res,
        actorId,
        domain,
        action: "create",
        resourceType: params.resource,
        resourceId: "new",
        adapterId: adapter.id,
        meshPath,
        requestBody,
        context,
        decision,
        execute: (headers) => adapter.createResource(meshPath, requestBody, headers)
      });
    } catch (error) {
      next(error);
    }
  };

  // MCP functions are governed by their catalog domain/entity/action, like any other write.
  const handleMcp = async (req: any, res: any, next: any) => {
    try {
      const actorId = requireActorId(req, input.actorHeader);
      const { adapterId, functionName } = z
        .object({ adapterId: z.string().min(1), functionName: z.string().min(1) })
        .parse(req.params);
      const adapter = input.adapterRegistry.getById(adapterId);
      if (!adapter.getMcpFunction || !adapter.invokeMcp) {
        throw new HttpError(501, "mcp_not_supported", "Adapter does not support MCP invocation");
      }

      const fn = await adapter.getMcpFunction(functionName, adapterHeadersFromRequest(req, { id: actorId }));
      if (!fn) {
        throw new HttpError(404, "mcp_function_not_found", `Unknown MCP function: ${functionName}`);
      }

      const domain = parseDomainSegment(fn.domain);
      const action = fn.action ?? "invoke";
      const resourceType = (fn.entity ?? "mcp").toLowerCase();
      const inputBody = (req.body?.input ?? req.body ?? {}) as Record<string, unknown>;
      const context = buildDomainContext(domain, inputBody, actorId, { resourceType, action, body: inputBody });
      context.requesterId = actorId;
      const decision = await evaluatePipeline(clients, { actorId, action, domain, context });

      await enforceAndExecute({
        req,
        res,
        actorId,
        domain,
        action,
        resourceType,
        resourceId: String(inputBody.id ?? inputBody[`${resourceType}Id`] ?? "new"),
        adapterId: adapter.id,
        meshPath: `/mesh/${adapter.id}/mcp/${encodeURIComponent(functionName)}`,
        requestBody: inputBody,
        context,
        decision,
        execute: (headers) => adapter.invokeMcp!(functionName, inputBody, headers)
      });
    } catch (error) {
      next(error);
    }
  };

  const handleOps = async (req: any, res: any, next: any) => {
    try {
      const actorId = requireActorId(req, input.actorHeader);
      const adapter = input.adapterRegistry.getById(String(req.params.adapterId));
      if (!adapter.forward) {
        throw new HttpError(501, "ops_not_supported", "Adapter does not support governed operations");
      }

      const opPath = String(req.params[0] ?? "");
      const requestBody = req.body ?? {};
      const op = findGovernedOperation(opPath, requestBody);
      if (!op) {
        throw new HttpError(404, "operation_not_governed", `No governed operation for path: ${opPath}`);
      }

      const context = buildDomainContext(op.domain, requestBody, actorId, {
        resourceType: op.resourceType,
        action: op.action,
        body: requestBody
      });
      // Approvals of nested resources carry no tracked requester, so separation of duties cannot apply.
      context.requesterId = op.action === "approve" ? "unknown-requester" : actorId;
      const decision = await evaluatePipeline(clients, { actorId, action: op.action, domain: op.domain, context });

      await enforceAndExecute({
        req,
        res,
        actorId,
        domain: op.domain,
        action: op.action,
        resourceType: op.resourceType,
        resourceId: op.resourceId,
        adapterId: adapter.id,
        meshPath: `/mesh/${adapter.id}/ops/${opPath.replace(/^\/+/, "")}`,
        requestBody,
        context,
        decision,
        execute: (headers) => adapter.forward!(op.backendPath, requestBody, headers)
      });
    } catch (error) {
      next(error);
    }
  };

  router.post("/:adapterId/ops/*", handleOps);
  router.post("/:adapterId/mcp/:functionName", handleMcp);
  router.get("/:adapterId/:domain/:resource/:id", handleGet);
  router.post("/:adapterId/:domain/:resource/:id/:action", handlePost);
  router.post("/:adapterId/:domain/:resource", handleCreate);

  return router;
}
