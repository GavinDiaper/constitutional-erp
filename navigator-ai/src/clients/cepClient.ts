import { randomUUID } from "node:crypto";
import { AppConfig } from "../config/env";
import { requestJson } from "./http";

export interface CanonicalEventPayload {
  eventId: string;
  eventType: string;
  eventVersion: number;
  occurredAt: string;
  source: {
    system: "navigator-ai";
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

export class CepClient {
  private sourceSequence = 0;

  constructor(private readonly config: AppConfig) {}

  async publish(input: {
    eventType: string;
    actorId?: string;
    domain: string;
    aggregateType: string;
    aggregateId: string;
    payload: Record<string, unknown>;
    tags?: string[];
  }): Promise<void> {
    this.sourceSequence += 1;

    const event: CanonicalEventPayload = {
      eventId: randomUUID(),
      eventType: input.eventType,
      eventVersion: 1,
      occurredAt: new Date().toISOString(),
      source: {
        system: "navigator-ai",
        streamId: `navigator-${input.domain.toLowerCase()}-${input.aggregateType}-${input.aggregateId}`,
        sequence: this.sourceSequence
      },
      correlation: {},
      actor: {
        actorId: input.actorId,
        ingressId: "navigator-ai",
        impersonated: false
      },
      domain: {
        domain: input.domain,
        aggregateType: input.aggregateType,
        aggregateId: input.aggregateId
      },
      payload: input.payload,
      metadata: {
        schemaVersion: 1,
        tags: input.tags ?? ["navigator"],
        flags: {
          isReplay: false,
          isSynthetic: false
        }
      }
    };

    await requestJson(`${this.config.eventProcessorUrl}/api/v1/events/ingest`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.config.eventProcessorApiKey
      },
      body: JSON.stringify({ events: [event] })
    });
  }

  async getHistory(input: {
    domain: string;
    aggregateType: string;
    aggregateId: string;
    limit?: number;
  }): Promise<Array<Record<string, unknown>>> {
    const params = new URLSearchParams({
      domain: input.domain,
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      limit: String(input.limit ?? 100)
    });

    const response = await requestJson<{ data: Array<Record<string, unknown>> }>(
      `${this.config.eventProcessorUrl}/api/v1/events?${params.toString()}`,
      {
        method: "GET",
        headers: {
          "x-api-key": this.config.eventProcessorApiKey
        }
      }
    );

    return response.data.data;
  }
}
