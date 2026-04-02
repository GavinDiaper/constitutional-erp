import { Router } from "express";
import { z } from "zod";
import { AggregateState, CanonicalDomain, CanonicalLink, CanonicalResource } from "../contracts/canonicalTypes";
import { loadConfig } from "../config/env";
import { appendCommandLog, createApprovalTask } from "../domain/commandStore";
import { evaluateTransition } from "../domain/policy/evaluateTransition";
import { rebuildAggregate } from "../domain/replay/rebuildAggregate";
import { findTransition, getAvailableTransitions } from "../domain/transitions/registry";
import { HttpError } from "../utils/errors";

const domainSchema = z.union([z.literal("p2p"), z.literal("o2c"), z.literal("r2r"), z.literal("h2r")]);

// URL segments use lowercase; canonical domain labels are uppercase
function toCanonicalDomain(seg: string): CanonicalDomain {
  return seg.toUpperCase() as CanonicalDomain;
}

// Lowercased URL segment for resource paths
function toDomainSegment(domain: CanonicalDomain): string {
  return domain.toLowerCase();
}

function buildResourceHref(domain: CanonicalDomain, aggregateType: string, id: string): string {
  return `/graph/${toDomainSegment(domain)}/${aggregateType}/${id}`;
}

function buildActionHref(domain: CanonicalDomain, aggregateType: string, id: string, action: string): string {
  return `${buildResourceHref(domain, aggregateType, id)}/${action}`;
}

function addSupplementalLinks(
  links: Record<string, CanonicalLink>,
  domain: CanonicalDomain,
  aggregateType: string,
  id: string,
  state: string
): void {
  if (domain !== "P2P" || state !== "Draft") {
    return;
  }

  if (aggregateType === "requisition" || aggregateType === "purchase-order") {
    links["add-line"] = {
      href: buildActionHref(domain, aggregateType, id, "add-line"),
      method: "POST",
      rel: "update"
    };
  }
}

const displayStringKeys = new Set([
  "authorityDecision",
  "authority_decision",
  "governanceDecision",
  "governance_decision",
  "decisionSnapshot",
  "decision_snapshot"
]);

function stringifyDisplayValue(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown serialization error";
    return `[unserializable object: ${detail}]`;
  }
}

function normalizeAttributesForDisplay(attributes: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = { ...attributes };

  for (const [key, value] of Object.entries(normalized)) {
    if (!displayStringKeys.has(key)) {
      continue;
    }

    if (value !== null && typeof value === "object") {
      normalized[key] = stringifyDisplayValue(value);
    }
  }

  return normalized;
}

/**
 * Produces the canonical resource envelope with unevaluated links
 * (no charter filtering). Used internally before charter annotation.
 */
function toCanonicalResource(state: AggregateState, links: Record<string, CanonicalLink>): CanonicalResource {
  return {
    id: state.id,
    domain: state.domain,
    type: state.aggregateType,
    state: state.state,
    attributes: normalizeAttributesForDisplay(state.attributes),
    links
  };
}

export const graphRouter = Router();

// ── GET /graph/:domain/:aggregateType/:id ─────────────────────────────────────
//
// 1. Rebuild aggregate state from the ledger (via Event Processor)
// 2. Derive available transitions from the canonical transition registry
// 3. Evaluate charter (authority + governance) for each candidate transition
// 4. Return canonical hypermedia with filtered/annotated links
//
graphRouter.get("/:domain/:aggregateType/:id", async (req, res, next) => {
  try {
    const domainSeg = domainSchema.parse(req.params["domain"]);
    const domain = toCanonicalDomain(domainSeg);
    const aggregateType = z.string().min(1).parse(req.params["aggregateType"]);
    const id = z.string().min(1).parse(req.params["id"]);
    const actorId = req.header("x-actor-id") ?? "";

    const aggregate = await rebuildAggregate(domain, aggregateType, id);
    const candidates = getAvailableTransitions(domain, aggregateType, aggregate.state);

    const links: Record<string, CanonicalLink> = {
      self: {
        href: buildResourceHref(domain, aggregateType, id),
        method: "GET",
        rel: "self"
      }
    };

    for (const transition of candidates) {
      // When no actor is provided skip charter evaluation; include the link unannotated
      if (!actorId) {
        links[transition.action] = {
          href: buildActionHref(domain, aggregateType, id, transition.action),
          method: "POST",
          rel: "transition"
        };
        continue;
      }

      try {
        const outcome = await evaluateTransition({
          actorId,
          action: transition.action,
          domain,
          aggregate,
          payload: {}
        });

        if (outcome.kind === "denied") {
          // Omit denied transitions from links
          continue;
        }

        links[transition.action] = {
          href: buildActionHref(domain, aggregateType, id, transition.action),
          method: "POST",
          rel: "transition",
          requiresApproval: outcome.kind === "requiresApproval",
          requiredTier: outcome.kind === "requiresApproval" ? outcome.requiredTier : undefined
        };
      } catch {
        // If a charter engine is unavailable, include the link without annotation
        links[transition.action] = {
          href: buildActionHref(domain, aggregateType, id, transition.action),
          method: "POST",
          rel: "transition"
        };
      }
    }

    addSupplementalLinks(links, domain, aggregateType, id, aggregate.state);

    res.json(toCanonicalResource(aggregate, links));
  } catch (error) {
    next(error);
  }
});

// ── POST /graph/:domain/:aggregateType/:id/:action ────────────────────────────
//
// 1. Rebuild current aggregate state
// 2. Validate the action is a valid canonical transition from current state
// 3. Evaluate charter (authority + governance)
// 4a. Denied        → 403 with canonical error body
// 4b. Requires approval → create approval task → 202 with task reference
// 4c. Allowed       → record command → optionally delegate to Mesh → return projected state
//
graphRouter.post("/:domain/:aggregateType/:id/:action", async (req, res, next) => {
  try {
    const domainSeg = domainSchema.parse(req.params["domain"]);
    const domain = toCanonicalDomain(domainSeg);
    const aggregateType = z.string().min(1).parse(req.params["aggregateType"]);
    const id = z.string().min(1).parse(req.params["id"]);
    const action = z.string().min(1).parse(req.params["action"]);
    const actorId = req.header("x-actor-id");

    if (!actorId) {
      throw new HttpError(400, "missing_actor", "Header x-actor-id is required for transitions");
    }

    const payload = (req.body ?? {}) as Record<string, unknown>;

    // Step 1: rebuild current state
    const aggregate = await rebuildAggregate(domain, aggregateType, id);

    // Step 2: validate transition exists from current state
    const transition = findTransition(domain, aggregateType, action);
    if (!transition) {
      throw new HttpError(
        422,
        "unknown_transition",
        `Action '${action}' is not a valid canonical transition for ${domain}/${aggregateType}`
      );
    }

    if (!transition.fromStates.includes(aggregate.state)) {
      throw new HttpError(
        422,
        "invalid_transition",
        `Action '${action}' cannot be applied when ${aggregateType} is in state '${aggregate.state}' (valid from: ${transition.fromStates.join(", ")})`
      );
    }

    // Step 3: charter evaluation
    const outcome = await evaluateTransition({ actorId, action, domain, aggregate, payload });

    // Step 4a: denied
    if (outcome.kind === "denied") {
      res.status(403).json({
        type: "https://process-graph.local/problems/transition_denied",
        title: "transition_denied",
        status: 403,
        detail: `Transition '${action}' was denied by constitutional authority`,
        reasons: outcome.reasons,
        domain,
        aggregateType,
        aggregateId: id,
        action
      });
      return;
    }

    // Step 4b: requires approval → create task, return 202
    if (outcome.kind === "requiresApproval") {
      const task = createApprovalTask({
        domain,
        aggregateType,
        aggregateId: id,
        action,
        actorId,
        payload,
        requiredApproverTier: outcome.requiredTier,
        status: "Pending"
      });

      res.status(202).json({
        status: "approval_required",
        detail: `Transition '${action}' requires approval at tier ${outcome.requiredTier}`,
        requiredTier: outcome.requiredTier,
        approvalTask: {
          id: task.id,
          href: `/graph/approvals/${task.id}`,
          requiredTier: task.requiredApproverTier
        },
        resource: toCanonicalResource(aggregate, {
          self: {
            href: buildResourceHref(domain, aggregateType, id),
            method: "GET",
            rel: "self"
          }
        })
      });
      return;
    }

    // Step 4c: allowed – determine projected state and log the command
    // The first toState is used as the projected state; partial/full splits
    // (e.g. receive → PartiallyReceived | FullyReceived) are resolved by
    // the caller providing a `projectedState` override in the payload.
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
        domain: toDomainSegment(domain),
        resource: aggregateType,
        id,
        action,
        actorId,
        payload
      });
      meshDelegated = meshResult.success;
    }

    appendCommandLog({
      domain,
      aggregateType,
      aggregateId: id,
      action,
      actorId,
      projectedState,
      payload,
      meshDelegated
    });

    // Return the projected canonical resource (optimistic state projection)
    const projectedAggregate: AggregateState = {
      ...aggregate,
      state: projectedState,
      attributes: { ...aggregate.attributes, ...payload },
      version: aggregate.version + 1
    };

    const links: Record<string, CanonicalLink> = {
      self: {
        href: buildResourceHref(domain, aggregateType, id),
        method: "GET",
        rel: "self"
      }
    };

    const nextCandidates = getAvailableTransitions(domain, aggregateType, projectedState);
    for (const t of nextCandidates) {
      links[t.action] = {
        href: buildActionHref(domain, aggregateType, id, t.action),
        method: "POST",
        rel: "transition"
      };
    }

    addSupplementalLinks(links, domain, aggregateType, id, projectedState);

    res.json(toCanonicalResource(projectedAggregate, links));
  } catch (error) {
    next(error);
  }
});
