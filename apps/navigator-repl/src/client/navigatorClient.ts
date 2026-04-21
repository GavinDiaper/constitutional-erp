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

  async createEntity(input: {
    operation:
      | "create-supplier"
      | "create-requisition"
      | "create-purchase-order"
      | "create-fiscal-year"
      | "create-fiscal-period"
      | "create-payment"
      | "create-inventory-sku"
      | "create-inventory-organization"
      | "create-project";
    actorId: string;
    payload: Record<string, unknown>;
  }): Promise<unknown> {
    return this.request("/create", {
      method: "POST",
      headers: {
        "x-actor-id": input.actorId
      },
      body: JSON.stringify(input)
    });
  }

  async getCreateLookups(input: {
    kind: "suppliers" | "ledgers" | "fiscal-years" | "invoices";
    actorId: string;
  }): Promise<unknown> {
    const query = new URLSearchParams({ actorId: input.actorId });
    return this.request(`/create/lookups/${encodeURIComponent(input.kind)}?${query.toString()}`, {
      method: "GET",
      headers: {
        "x-actor-id": input.actorId
      }
    });
  }

  async promptCreate(input: {
    prompt: string;
    actorId: string;
    domain?: "P2P" | "O2C" | "R2R" | "H2R" | "INV" | "PROJ";
    dryRun?: boolean;
  }): Promise<unknown> {
    return this.request("/create/prompt", {
      method: "POST",
      headers: {
        "x-actor-id": input.actorId
      },
      body: JSON.stringify(input)
    });
  }

  async nextSteps(ctx: SessionContext, limit = 6): Promise<unknown> {
    const ready = requireContext(ctx);
    return this.request("/next-steps", {
      method: "POST",
      headers: {
        "x-actor-id": ready.actorId
      },
      body: JSON.stringify({
        context: ready,
        limit
      })
    });
  }

  async listApprovals(ctx: SessionContext, limit = 50, status?: "PENDING" | "APPROVED" | "REJECTED" | "ESCALATED" | "EXPIRED"): Promise<unknown> {
    const ready = requireContext(ctx);
    const query = new URLSearchParams({
      domain: ready.domain,
      aggregateType: ready.aggregateType,
      aggregateId: ready.aggregateId,
      limit: String(limit)
    });

    if (status) {
      query.set("status", status);
    }

    return this.request(`/approvals?${query.toString()}`, {
      method: "GET",
      headers: {
        "x-actor-id": ready.actorId
      }
    });
  }

  async getApproval(approvalRequestId: string): Promise<unknown> {
    return this.request(`/approvals/${encodeURIComponent(approvalRequestId)}`, {
      method: "GET"
    });
  }

  async resolveApproval(input: {
    approvalRequestId: string;
    action: "approve" | "reject" | "escalate";
    actorId: string;
    note?: string;
    requiredTier?: number;
  }): Promise<unknown> {
    return this.request(`/approvals/${encodeURIComponent(input.approvalRequestId)}/${input.action}`, {
      method: "POST",
      headers: {
        "x-actor-id": input.actorId
      },
      body: JSON.stringify({
        actorId: input.actorId,
        note: input.note,
        requiredTier: input.requiredTier
      })
    });
  }
}
