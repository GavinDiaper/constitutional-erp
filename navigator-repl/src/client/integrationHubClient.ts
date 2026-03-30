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

function requireContext(ctx: SessionContext): Required<Pick<SessionContext, "domain" | "aggregateType" | "aggregateId" | "actorId">> {
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

export class IntegrationHubClient {
  constructor(private readonly config: ReplConfig) {}

  private async request(path: string, init: RequestInit = {}, useHubBaseUrl = true): Promise<unknown> {
    const baseUrl = useHubBaseUrl ? this.config.integrationHubUrl : this.config.eventProcessorUrl;
    const apiKey = useHubBaseUrl ? this.config.integrationHubApiKey : this.config.eventProcessorApiKey;

    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
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
      throw new Error(`Request failed (${response.status}): ${detail}`);
    }

    return body;
  }

  async startSession(ctx: SessionContext, mode: "offline" | "online" = "offline"): Promise<string> {
    if (!ctx.actorId) {
      throw new Error("Actor not set. Use: set actor <actorId>");
    }

    const body = await this.request("/api/v1/hub/sessions", {
      method: "POST",
      body: JSON.stringify({
        actorId: ctx.actorId,
        mode,
        context: {
          domain: ctx.domain,
          aggregateType: ctx.aggregateType,
          aggregateId: ctx.aggregateId
        }
      })
    }) as { sessionId?: string };

    if (!body.sessionId) {
      throw new Error("Session creation did not return a sessionId");
    }

    return body.sessionId;
  }

  async endSession(sessionId: string): Promise<unknown> {
    return this.request(`/api/v1/hub/sessions/${sessionId}/end`, { method: "POST" });
  }

  async mcpFunctions(): Promise<unknown> {
    return this.request("/api/v1/hub/mcp/functions", { method: "GET" });
  }

  async process(ctx: SessionContext): Promise<unknown> {
    const ready = requireContext(ctx);
    return this.request(`/api/v1/hub/process/${encodeURIComponent(ready.aggregateType)}/${encodeURIComponent(ready.aggregateId)}`, {
      method: "GET",
      headers: {
        "x-actor-id": ready.actorId
      }
    });
  }

  async execute(ctx: SessionContext, action: string, payload: Record<string, unknown>): Promise<unknown> {
    const ready = requireContext(ctx);
    return this.request(`/api/v1/hub/process/${encodeURIComponent(ready.aggregateType)}/${encodeURIComponent(ready.aggregateId)}/actions/${encodeURIComponent(action)}`, {
      method: "POST",
      headers: {
        "x-actor-id": ready.actorId
      },
      body: JSON.stringify(payload)
    });
  }

  async appendNavlog(sessionId: string, entry: Record<string, unknown>): Promise<void> {
    await this.request(`/api/v1/hub/sessions/${sessionId}/navlog`, {
      method: "POST",
      body: JSON.stringify(entry)
    });
  }

  async navlog(sessionId: string): Promise<unknown> {
    return this.request(`/api/v1/hub/sessions/${sessionId}/navlog`, { method: "GET" });
  }

  async transcript(sessionId: string, inputText: string, outputText: string): Promise<void> {
    await this.request(`/api/v1/hub/sessions/${sessionId}/transcript`, {
      method: "POST",
      body: JSON.stringify({
        input: inputText,
        output: outputText,
        timestamp: new Date().toISOString()
      })
    });
  }

  async getTranscript(sessionId: string): Promise<unknown> {
    return this.request(`/api/v1/hub/sessions/${sessionId}/transcript`, { method: "GET" });
  }

  async events(ctx: SessionContext, limit = 20): Promise<unknown> {
    const ready = requireContext(ctx);
    return this.request(`/api/v1/events?domain=${encodeURIComponent(ready.domain.toLowerCase())}&aggregateType=${encodeURIComponent(ready.aggregateType)}&aggregateId=${encodeURIComponent(ready.aggregateId)}&limit=${limit}`, {
      method: "GET"
    }, false);
  }
}
