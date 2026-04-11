"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.replayToHead = replayToHead;
const foundationErpEventMapper_1 = require("../adapters/foundationErpEventMapper");
const env_1 = require("../config/env");
const connection_1 = require("../db/connection");
const handlers_1 = require("./handlers");
const state_1 = require("./state");
const BATCH_SIZE = 100;
function sortRows(rows) {
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
async function fetchBatch(afterTimestamp) {
    const config = (0, env_1.loadConfig)();
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
    const parsed = (await response.json());
    return sortRows(parsed.data ?? []);
}
async function replayToHead() {
    let cursor = (0, state_1.getLastEventTimestamp)();
    while (true) {
        const rows = await fetchBatch(cursor);
        if (rows.length === 0) {
            break;
        }
        (0, connection_1.transaction)(() => {
            for (const row of rows) {
                const mapped = (0, foundationErpEventMapper_1.mapFoundationEventToCanonical)(row);
                if (mapped) {
                    (0, handlers_1.applyCanonicalEvent)(mapped);
                }
                const nextCursor = String(row.timestamp ?? "");
                if (nextCursor) {
                    cursor = nextCursor;
                    (0, state_1.setLastEventTimestamp)(nextCursor);
                }
            }
        });
        if (rows.length < BATCH_SIZE) {
            break;
        }
    }
}
