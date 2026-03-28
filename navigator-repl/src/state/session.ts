export interface SessionContext {
  domain?: "P2P" | "O2C" | "R2R" | "H2R";
  aggregateType?: string;
  aggregateId?: string;
  actorId?: string;
}

export function contextString(ctx: SessionContext): string {
  return [
    `actor=${ctx.actorId ?? "<unset>"}`,
    `domain=${ctx.domain ?? "<unset>"}`,
    `aggregateType=${ctx.aggregateType ?? "<unset>"}`,
    `aggregateId=${ctx.aggregateId ?? "<unset>"}`
  ].join(" ");
}
