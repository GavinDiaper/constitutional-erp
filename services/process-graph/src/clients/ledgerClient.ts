import { LedgerEvent } from "../contracts/canonicalTypes";
import { loadConfig } from "../config/env";

// Thin HTTP client for the Event Processor's aggregate-replay endpoint.
// Uses the built-in fetch (Node 18+) to avoid extra dependencies.

function getConfig() {
  return loadConfig();
}

/**
 * Fetches all ledger events for a given aggregate from the Event Processor.
 * Returns events ordered by occurredAt ASC (matching CEP's order guarantee).
 */
export async function fetchAggregateEvents(
  domain: string,
  aggregateType: string,
  aggregateId: string
): Promise<LedgerEvent[]> {
  const config = getConfig();

  const params = new URLSearchParams({
    domain,
    aggregateType,
    aggregateId
  });

  const url = `${config.eventProcessorUrl}/api/v1/replay/aggregate?${params.toString()}`;

  const response = await fetch(url, {
    headers: {
      "x-api-key": config.eventProcessorApiKey,
      "Content-Type": "application/json"
    }
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `Ledger client: Event Processor returned ${response.status} for aggregate ${domain}/${aggregateType}/${aggregateId}: ${text}`
    );
  }

  const body = (await response.json()) as { data: LedgerEvent[] };
  return body.data ?? [];
}
