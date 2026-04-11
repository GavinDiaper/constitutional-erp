import { mapFoundationEventToCanonical } from "../adapters/foundationErpEventMapper";
import { loadConfig } from "../config/env";
import { transaction } from "../db/connection";
import { applyCanonicalEvent } from "./handlers";
import { getLastEventTimestamp, setLastEventTimestamp } from "./state";

const BATCH_SIZE = 100;

interface FoundationEventListResponse {
  data: Array<Record<string, unknown>>;
}

function sortRows(rows: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  return [...rows].sort((a, b) => {
    const at = String(a.timestamp ?? "");
    const bt = String(b.timestamp ?? "");
    if (at < bt) {
      return -1;
    }
    if (at > bt) {
      return 1;
    }

    const aid = String(a.event_id ?? a.eventId ?? "");
    const bid = String(b.event_id ?? b.eventId ?? "");
    return aid.localeCompare(bid);
  });
}

async function fetchBatch(afterTimestamp: string): Promise<Array<Record<string, unknown>>> {
  const config = loadConfig();
  const url = new URL(`${config.foundationErpUrl}/api/v1/events`);
  url.searchParams.set("limit", String(BATCH_SIZE));
  if (afterTimestamp) {
    url.searchParams.set("after", afterTimestamp);
  }

  const response = await fetch(url, {
    headers: {
      "x-api-key": config.foundationErpApiKey,
      [config.foundationErpIngressIdHeader]: config.foundationErpIngressId
    }
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Foundation ERP event fetch failed (${response.status}): ${body}`);
  }

  const parsed = (await response.json()) as FoundationEventListResponse;
  return sortRows(parsed.data ?? []);
}

export async function replayToHead(): Promise<void> {
  let cursor = getLastEventTimestamp();

  while (true) {
    const rows = await fetchBatch(cursor);
    if (rows.length === 0) {
      break;
    }

    transaction(() => {
      for (const row of rows) {
        const mapped = mapFoundationEventToCanonical(row);
        if (mapped) {
          applyCanonicalEvent(mapped);
        }

        const nextCursor = String(row.timestamp ?? "");
        if (nextCursor) {
          cursor = nextCursor;
          setLastEventTimestamp(nextCursor);
        }
      }
    });

    if (rows.length < BATCH_SIZE) {
      break;
    }
  }
}
