import { ReplConfig } from "../config/env";

interface SessionContext {
  domain?: "P2P" | "O2C" | "R2R" | "H2R";
  aggregateType?: string;
  aggregateId?: string;
  actorId?: string;
}

function requireContext(ctx: SessionContext): Required<SessionContext> {
  if (!ctx.domain || !ctx.aggregateType || !ctx.aggregateId || !ctx.actorId) {
    throw new Error("Context not ready. Use: set actor <actorId> and use <domain> <aggregateType> <id>");
  }

  return {
    domain: ctx.domain,
    aggregateType: ctx.aggregateType,
    aggregateId: ctx.aggregateId,
    actorId: ctx.actorId
  };
}

export class NavigatorClient {
  constructor(private readonly config: ReplConfig) {}

  private async request(path: string, init: RequestInit = {}): Promise<unknown> {
    const response = await fetch(`${this.config.navigatorUrl}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        "x-api-key": this.config.navigatorApiKey,
        ...(init.headers ?? {})
      }
    });

    const text = await response.text();
    const body = text ? JSON.parse(text) : {};

    if (!response.ok) {
      const detail = typeof body?.detail === "string" ? body.detail : text;
      throw new Error(`Navigator request failed (${response.status}): ${detail}`);
    }

    return body;
  }

  private queryFromContext(ctx: Required<SessionContext>): string {
    const params = new URLSearchParams({
      domain: ctx.domain,
      aggregateType: ctx.aggregateType,
      aggregateId: ctx.aggregateId,
      actorId: ctx.actorId
    });

    return params.toString();
  }

  async show(ctx: SessionContext): Promise<unknown> {
    const ready = requireContext(ctx);
    return this.request(`/api/v1/resource?${this.queryFromContext(ready)}`, { method: "GET" });
  }

  async propose(ctx: SessionContext): Promise<unknown> {
    const ready = requireContext(ctx);
    return this.request("/api/v1/rank", {
      method: "POST",
      body: JSON.stringify(ready)
    });
  }

  async explain(ctx: SessionContext, actionId?: string): Promise<unknown> {
    const ready = requireContext(ctx);
    return this.request("/api/v1/explain", {
      method: "POST",
      body: JSON.stringify({ context: ready, actionId })
    });
  }

  async simulate(ctx: SessionContext, actionId: string): Promise<unknown> {
    const ready = requireContext(ctx);
    return this.request("/api/v1/simulate", {
      method: "POST",
      body: JSON.stringify({ context: ready, actionId })
    });
  }

  async decide(ctx: SessionContext): Promise<unknown> {
    const ready = requireContext(ctx);
    return this.request("/api/v1/decide", {
      method: "POST",
      body: JSON.stringify(ready)
    });
  }

  async execute(ctx: SessionContext, actionId?: string): Promise<unknown> {
    const ready = requireContext(ctx);
    return this.request("/api/v1/execute", {
      method: "POST",
      body: JSON.stringify({ context: ready, actionId })
    });
  }

  async history(ctx: SessionContext): Promise<unknown> {
    const ready = requireContext(ctx);
    return this.request(`/api/v1/history?${this.queryFromContext(ready)}`, { method: "GET" });
  }

  async navlog(ctx: SessionContext): Promise<unknown> {
    const ready = requireContext(ctx);
    return this.request(`/api/v1/navlog?${this.queryFromContext(ready)}`, { method: "GET" });
  }

  async transcript(actorId: string | undefined, commandText: string, outputText: string): Promise<void> {
    await this.request("/api/v1/transcript", {
      method: "POST",
      body: JSON.stringify({ actorId, commandText, outputText })
    });
  }
}
