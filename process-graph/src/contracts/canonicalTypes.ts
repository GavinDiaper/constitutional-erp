// ---------------------------------------------------------------------------
// Core domain types shared across the Process Graph Engine
// ---------------------------------------------------------------------------

export type CanonicalDomain = "P2P" | "O2C" | "R2R" | "H2R";

// A single canonical transition definition (state-machine edge)
export interface CanonicalTransition {
  /** Stable identifier, e.g. "P2P.Requisition.submit" */
  id: string;
  domain: CanonicalDomain;
  aggregateType: string;
  fromStates: string[];
  /** One or more possible outcome states – resolved at event-emission time */
  toStates: string[];
  action: string;
}

// Reconstructed aggregate state (from ledger replay)
export interface AggregateState {
  id: string;
  domain: CanonicalDomain;
  aggregateType: string;
  state: string;
  attributes: Record<string, unknown>;
  /** Number of events applied */
  version: number;
}

// A single hypermedia link in the canonical resource envelope
export interface CanonicalLink {
  href: string;
  method: "GET" | "POST";
  rel: string;
  requiresApproval?: boolean;
  requiredTier?: number;
  riskLevel?: string;
}

// The top-level canonical resource returned by GET /graph/...
export interface CanonicalResource {
  id: string;
  domain: string;
  type: string;
  state: string;
  attributes: Record<string, unknown>;
  links: Record<string, CanonicalLink>;
}

// Outcome of evaluating whether an actor may perform a transition
export type PolicyOutcome =
  | { kind: "allowed"; effectiveTier: number }
  | { kind: "denied"; reasons: string[] }
  | { kind: "requiresApproval"; requiredTier: number; reasons: string[] };

// Minimal ledger event shape needed for replay (mirrors CEP CanonicalEvent)
export interface LedgerEvent {
  eventId: string;
  eventType: string;
  eventVersion: number;
  occurredAt: string;
  source: {
    system: string;
    streamId: string;
    sequence: number;
  };
  correlation: {
    correlationId?: string;
    causationId?: string;
  };
  actor: {
    actorId?: string;
    ingressId?: string;
    impersonated: boolean;
  };
  domain: {
    domain: string;
    aggregateType: string;
    aggregateId: string;
    tenantId?: string;
  };
  payload: Record<string, unknown>;
  metadata: {
    schemaVersion: number;
    tags: string[];
    flags: {
      isReplay: boolean;
      isSynthetic: boolean;
    };
  };
}

// An approval task created when governance requires approval before execution
export interface ApprovalTask {
  id: string;
  domain: CanonicalDomain;
  aggregateType: string;
  aggregateId: string;
  action: string;
  actorId: string;
  payload: Record<string, unknown>;
  requiredApproverTier: number;
  status: "Pending" | "Approved" | "Rejected";
  createdAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
  resolutionNote?: string;
}

// A recorded canonical command (audit/idempotency log)
export interface CommandLogEntry {
  id: string;
  domain: CanonicalDomain;
  aggregateType: string;
  aggregateId: string;
  action: string;
  actorId: string;
  projectedState: string;
  payload: Record<string, unknown>;
  meshDelegated: boolean;
  createdAt: string;
}
