export type CanonicalSourceSystem =
  | "event-processor"
  | "foundation-erp"
  | "mesh-gateway"
  | "authority-engine"
  | "governance-engine"
  | "navigator-ai"
  | "external-erp";

export interface CanonicalEvent {
  eventId: string;
  eventType: string;
  eventVersion: number;
  occurredAt: string;
  source: {
    system: CanonicalSourceSystem;
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
    governance?: {
      riskLevel?: "Low" | "Medium" | "High";
      requiredTier?: 1 | 2 | 3 | 4 | 5;
      governanceTag?: string;
      requiredApproval?: boolean;
      approverTier?: 1 | 2 | 3 | 4 | 5;
    };
  };
}

export interface LedgerQuery {
  limit?: number;
  after?: string;
  sourceSystem?: CanonicalSourceSystem;
  domain?: string;
  aggregateType?: string;
  aggregateId?: string;
}

export interface SourceCursorStatus {
  sourceSystem: CanonicalSourceSystem;
  cursor?: string;
  lastEventAt?: string;
  lastStatus: string;
  lastError?: string;
  lastPolledAt?: string;
  updatedAt: string;
}