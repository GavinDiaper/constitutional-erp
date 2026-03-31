import { randomUUID } from "node:crypto";
import { MeshClient } from "../clients/meshClient";
import { PgeClient, PgeResource } from "../clients/pgeClient";
import { HttpError } from "../utils/errors";
import { HypermediaBuilder } from "./hypermediaBuilder";
import { McpCatalog } from "./mcpCatalog";
import { ProcessStateResponse } from "./types";

interface EntityMapEntry {
  domain: "o2c" | "p2p" | "r2r" | "h2r";
  aggregateType: string;
}

const ENTITY_MAP: Record<string, EntityMapEntry> = {
  quote: { domain: "o2c", aggregateType: "quote" },
  salesorder: { domain: "o2c", aggregateType: "sales-order" },
  arinvoice: { domain: "o2c", aggregateType: "ar-invoice" },
  arpayment: { domain: "o2c", aggregateType: "ar-payment" },

  requisition: { domain: "p2p", aggregateType: "requisition" },
  supplier: { domain: "p2p", aggregateType: "supplier" },
  purchaseorder: { domain: "p2p", aggregateType: "purchase-order" },
  goodsreceipt: { domain: "p2p", aggregateType: "goods-receipt" },
  supplierinvoice: { domain: "p2p", aggregateType: "supplier-invoice" },
  appayment: { domain: "p2p", aggregateType: "ap-payment" },

  account: { domain: "r2r", aggregateType: "account" },
  fiscalyear: { domain: "r2r", aggregateType: "fiscal-year" },
  fiscalperiod: { domain: "r2r", aggregateType: "fiscal-period" },
  journal: { domain: "r2r", aggregateType: "journal" },

  employee: { domain: "h2r", aggregateType: "employee" },
  position: { domain: "h2r", aggregateType: "position" },
  assignment: { domain: "h2r", aggregateType: "assignment" },
  credential: { domain: "h2r", aggregateType: "credential" },
  authorityrule: { domain: "h2r", aggregateType: "authority-rule" }
};

function normalizeEntity(entity: string): string {
  return entity.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

export class ProcessFacade {
  constructor(
    private readonly catalog: McpCatalog,
    private readonly pgeClient: PgeClient,
    private readonly meshClient: MeshClient,
    private readonly hypermediaBuilder: HypermediaBuilder
  ) {}

  private resolveEntity(entity: string): EntityMapEntry {
    const resolved = ENTITY_MAP[normalizeEntity(entity)];
    if (!resolved) {
      throw new HttpError(404, "entity_not_supported", `Unsupported process entity: ${entity}`);
    }

    return resolved;
  }

  async getProcess(entity: string, id: string, actorId?: string): Promise<ProcessStateResponse> {
    const resolved = this.resolveEntity(entity);
    const resource = await this.pgeClient.getResource({
      domain: resolved.domain,
      aggregateType: resolved.aggregateType,
      aggregateId: id,
      actorId
    });

    return {
      entity,
      id,
      entityType: entity,
      entityId: id,
      state: resource.state,
      attributes: resource.attributes,
      links: this.hypermediaBuilder.build({ entity, id, resource })
    };
  }

  async executeAction(input: {
    entity: string;
    id: string;
    action: string;
    payload: Record<string, unknown>;
    actorId?: string;
  }) {
    const fn = this.catalog.getByEntityAndAction(input.entity, input.action);
    if (!fn) {
      throw new HttpError(404, "action_not_found", `No MCP function mapped for ${input.entity}.${input.action}`);
    }

    if (!input.actorId) {
      throw new HttpError(400, "missing_actor", "actorId is required to execute a process action");
    }

    const resolved = this.resolveEntity(input.entity);
    const before = await this.getProcess(input.entity, input.id, input.actorId);

    // Execute the action via the process graph engine. PGE validates the
    // transition from current state, records the command and returns an
    // optimistic projection of the new state with the correct next-step links.
    // This avoids reading back through the async event-processor ledger, which
    // would return stale (pre-transition) state and links until the next poll.
    const pgeResponse = await this.pgeClient.postAction({
      domain: resolved.domain,
      aggregateType: resolved.aggregateType,
      aggregateId: input.id,
      action: input.action,
      payload: input.payload,
      actorId: input.actorId
    });

    // PGE returns 202 when the action requires approval from a higher tier.
    // Surface this directly without executing through mesh.
    if (pgeResponse.status === 202) {
      return pgeResponse.data as Record<string, unknown>;
    }

    if (pgeResponse.status >= 400) {
      const data = pgeResponse.data as Record<string, unknown> | null;
      const detail = typeof data?.["detail"] === "string" ? data["detail"] : `PGE rejected action ${input.action}`;
      throw new HttpError(pgeResponse.status, "pge_action_failed", detail);
    }

    const pgeResult = pgeResponse.data as PgeResource;

    // Also execute through mesh so the backing adapter (Foundation ERP) commits
    // the transition. We do this after PGE so the state is already projected;
    // errors here surface as-is to the caller.
    const backingRoute = fn.backingRoute.replace("{id}", encodeURIComponent(input.id));
    const execution = await this.meshClient.execute(backingRoute, input.payload, input.actorId);

    const afterLinks = this.hypermediaBuilder.build({ entity: input.entity, id: input.id, resource: pgeResult });

    return {
      entity: input.entity,
      id: input.id,
      previousState: before.state,
      newState: pgeResult.state,
      timestamp: new Date().toISOString(),
      eventId: typeof execution.eventId === "string" ? execution.eventId : `evt-${randomUUID()}`,
      links: afterLinks
    };
  }
}
