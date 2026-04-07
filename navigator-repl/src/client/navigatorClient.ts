import { ReplConfig } from "../config/env";
import { SessionContext } from "../state/session";

function parseBody(text: string): unknown {
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function requireContext(
  ctx: SessionContext
): Required<Pick<SessionContext, "domain" | "aggregateType" | "aggregateId" | "actorId">> {
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
    const baseUrl = this.config.navigatorAiUrl.replace(/\/$/, "");

    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        "x-api-key": this.config.navigatorAiApiKey,
        ...(init.headers ?? {})
      }
    });

    const text = await response.text();
    const body = parseBody(text);

    if (!response.ok) {
      const detail = typeof (body as { detail?: unknown })?.detail === "string"
        ? (body as { detail: string }).detail
        : typeof (body as { raw?: unknown })?.raw === "string"
          ? (body as { raw: string }).raw
          : text;
      throw new Error(`Navigator request failed (${response.status}): ${detail}`);
    }

    return body;
  }

  async getResource(ctx: SessionContext): Promise<unknown> {
    const ready = requireContext(ctx);
    const query = new URLSearchParams({
      domain: ready.domain,
      aggregateType: ready.aggregateType,
      aggregateId: ready.aggregateId,
      actorId: ready.actorId
    });

    return this.request(`/resource?${query.toString()}`, {
      method: "GET",
      headers: {
        "x-actor-id": ready.actorId
      }
    });
  }

  async rankActions(ctx: SessionContext): Promise<unknown> {
    const ready = requireContext(ctx);
    return this.request("/rank", {
      method: "POST",
      headers: {
        "x-actor-id": ready.actorId
      },
      body: JSON.stringify(ready)
    });
  }

  async explainDecision(ctx: SessionContext, actionId?: string): Promise<unknown> {
    const ready = requireContext(ctx);
    return this.request("/explain", {
      method: "POST",
      headers: {
        "x-actor-id": ready.actorId
      },
      body: JSON.stringify({
        context: ready,
        actionId: actionId || undefined
      })
    });
  }

  async simulateAction(ctx: SessionContext, actionId: string): Promise<unknown> {
    const ready = requireContext(ctx);
    return this.request("/simulate", {
      method: "POST",
      headers: {
        "x-actor-id": ready.actorId
      },
      body: JSON.stringify({ context: ready, actionId })
    });
  }

  async decide(ctx: SessionContext): Promise<unknown> {
    const ready = requireContext(ctx);
    return this.request("/decide", {
      method: "POST",
      headers: {
        "x-actor-id": ready.actorId
      },
      body: JSON.stringify(ready)
    });
  }

  async execute(ctx: SessionContext, actionId?: string): Promise<unknown> {
    const ready = requireContext(ctx);
    return this.request("/execute", {
      method: "POST",
      headers: {
        "x-actor-id": ready.actorId
      },
      body: JSON.stringify({ context: ready, actionId: actionId || undefined })
    });
  }

  async getHistory(ctx: SessionContext, limit = 50): Promise<unknown> {
    const ready = requireContext(ctx);
    const query = new URLSearchParams({
      domain: ready.domain,
      aggregateType: ready.aggregateType,
      aggregateId: ready.aggregateId,
      actorId: ready.actorId,
      limit: String(limit)
    });

    return this.request(`/history?${query.toString()}`, {
      method: "GET",
      headers: {
        "x-actor-id": ready.actorId
      }
    });
  }

  async getNavigatorEvents(ctx: SessionContext, limit = 50): Promise<unknown> {
    const ready = requireContext(ctx);
    const query = new URLSearchParams({
      domain: ready.domain,
      aggregateType: ready.aggregateType,
      aggregateId: ready.aggregateId,
      actorId: ready.actorId,
      limit: String(limit)
    });

    return this.request(`/navlog?${query.toString()}`, {
      method: "GET",
      headers: {
        "x-actor-id": ready.actorId
      }
    });
  }
}
