export interface SessionContext {
  domain?: "P2P" | "O2C" | "R2R" | "H2R" | "INV" | "PROJ";
  aggregateType?: string;
  aggregateId?: string;
  actorId?: string;
  sessionId?: string;
  lastLinks?: Array<{
    rel: string;
    method?: string;
    href?: string;
    governance?: {
      riskLevel?: string;
      requiredTier?: number;
      governanceTag?: string;
    };
  }>;
}

export function contextString(ctx: SessionContext): string {
  return [
    `actor=${ctx.actorId ?? "<unset>"}`,
    `sessionId=${ctx.sessionId ?? "<unset>"}`,
    `domain=${ctx.domain ?? "<unset>"}`,
    `aggregateType=${ctx.aggregateType ?? "<unset>"}`,
    `aggregateId=${ctx.aggregateId ?? "<unset>"}`
  ].join(" ");
}
