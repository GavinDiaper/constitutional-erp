import { randomUUID } from "node:crypto";
import { MeshClient } from "../clients/meshClient";
import { PgeClient } from "../clients/pgeClient";
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

    const before = await this.getProcess(input.entity, input.id, input.actorId);
    const backingRoute = fn.backingRoute.replace("{id}", encodeURIComponent(input.id));
    const execution = await this.meshClient.execute(backingRoute, input.payload, input.actorId);
    const after = await this.getProcess(input.entity, input.id, input.actorId);

    return {
      entity: input.entity,
      id: input.id,
      previousState: before.state,
      newState: after.state,
      timestamp: new Date().toISOString(),
      eventId: typeof execution.eventId === "string" ? execution.eventId : `evt-${randomUUID()}`,
      links: after.links
    };
  }
}
