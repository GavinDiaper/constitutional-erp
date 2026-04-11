import { loadConfig } from "../config/env";
import { transaction } from "../db/connection";
import { appendCanonicalEvent, recordDeadLetter } from "../domain/ledgerStore";
import { createSourceDefinitions, SourceDefinition } from "../domain/sourceDefinitions";
import { getSourceCursor, upsertSourceCursor } from "../domain/sourceCursorStore";

const BATCH_SIZE = 100;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function replaySourceToHead(source: SourceDefinition): Promise<void> {
  let cursor = getSourceCursor(source.sourceSystem)?.cursor;

  while (true) {
    const rows = await source.client.fetchBatch(cursor, BATCH_SIZE);
    if (rows.length === 0) {
      const current = getSourceCursor(source.sourceSystem);
      upsertSourceCursor({
        sourceSystem: source.sourceSystem,
        cursor: current?.cursor,
        lastEventAt: current?.lastEventAt,
        lastStatus: "Ready"
      });
      break;
    }

    for (const row of rows) {
      const nextCursor = source.adapter.cursorOf(row);

      transaction(() => {
        try {
          const event = source.adapter.normalize({
            sourceSystem: source.sourceSystem,
            rawPayload: row,
            receivedAt: new Date().toISOString()
          });

          appendCanonicalEvent(event);
          cursor = nextCursor;
          upsertSourceCursor({
            sourceSystem: source.sourceSystem,
            cursor,
            lastEventAt: event.occurredAt,
            lastStatus: "Ready"
          });
        } catch (error) {
          const message = errorMessage(error);
          recordDeadLetter({
            sourceSystem: source.sourceSystem,
            sourceCursor: nextCursor,
            errorCode: "normalization_failed",
            errorDetail: message,
            rawPayload: row
          });

          cursor = nextCursor;
          upsertSourceCursor({
            sourceSystem: source.sourceSystem,
            cursor,
            lastStatus: "Error",
            lastError: message
          });
        }
      });
    }

    if (rows.length < BATCH_SIZE) {
      break;
    }
  }
}

export async function replayToHead(): Promise<void> {
  const config = loadConfig();
  const sources = createSourceDefinitions(config);

  for (const source of sources) {
    await replaySourceToHead(source);
  }
}