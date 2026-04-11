"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.appendAuthorityEvent = appendAuthorityEvent;
exports.listAuthorityEvents = listAuthorityEvents;
const connection_1 = require("../db/connection");
const id_1 = require("../utils/id");
function appendAuthorityEvent(event) {
    const eventId = event.eventId ?? (0, id_1.newId)("AEVT-");
    connection_1.db.prepare(`INSERT OR IGNORE INTO authority_event (
      event_id, entity_id, entity_type, event_type, version, timestamp, payload, correlation_id, causation_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(eventId, event.entityId, event.entityType, event.eventType, event.version, new Date().toISOString(), JSON.stringify(event.payload), event.correlationId ?? null, event.causationId ?? null);
    return eventId;
}
function listAuthorityEvents(limit = 100, afterTimestamp) {
    if (afterTimestamp) {
        return connection_1.db
            .prepare(`SELECT * FROM authority_event WHERE timestamp > ? ORDER BY timestamp ASC LIMIT ?`)
            .all(afterTimestamp, limit);
    }
    return connection_1.db.prepare(`SELECT * FROM authority_event ORDER BY timestamp ASC LIMIT ?`).all(limit);
}
