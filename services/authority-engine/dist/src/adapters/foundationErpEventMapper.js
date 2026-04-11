"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapFoundationEventToCanonical = mapFoundationEventToCanonical;
const zod_1 = require("zod");
const canonicalSchemas_1 = require("../contracts/canonicalSchemas");
const recordSchema = zod_1.z.record(zod_1.z.any());
function asObject(payload) {
    if (typeof payload === "string") {
        return recordSchema.parse(JSON.parse(payload));
    }
    return recordSchema.parse(payload ?? {});
}
function eventTypeOf(row) {
    return String(row.event_type ?? row.eventType ?? "");
}
function eventIdOf(row) {
    return String(row.event_id ?? row.eventId ?? "");
}
function entityIdOf(row) {
    return String(row.entity_id ?? row.entityId ?? "");
}
function occurredAtOf(row) {
    return String(row.timestamp ?? "");
}
function versionOf(row) {
    return Number(row.version ?? 1);
}
function parseCanonicalEvent(event) {
    return canonicalSchemas_1.canonicalEventSchema.parse(event);
}
function mapFoundationEventToCanonical(row) {
    const type = eventTypeOf(row);
    const payload = asObject(row.payload);
    const entityId = entityIdOf(row);
    const sourceEventId = eventIdOf(row);
    const occurredAt = occurredAtOf(row);
    const version = versionOf(row);
    const base = { entityId, sourceEventId, occurredAt, version };
    switch (type) {
        case "EmployeeHired":
            return parseCanonicalEvent({
                ...base,
                type,
                payload: {
                    employeeId: entityId,
                    name: String(payload.name ?? ""),
                    email: payload.email ? String(payload.email) : undefined
                }
            });
        case "EmployeeTerminated":
        case "EmployeeOnLeave":
        case "EmployeeReturned":
            return parseCanonicalEvent({
                ...base,
                type,
                payload: {
                    employeeId: entityId,
                    fromStatus: payload.from ? String(payload.from) : undefined,
                    toStatus: payload.to ? String(payload.to) : undefined
                }
            });
        case "PositionCreated":
            return parseCanonicalEvent({
                ...base,
                type,
                payload: {
                    positionId: entityId,
                    title: String(payload.title ?? ""),
                    department: String(payload.department ?? ""),
                    authorityDomain: String(payload.authorityDomain ?? ""),
                    authorityTier: Number(payload.authorityTier)
                }
            });
        case "AssignmentCreated":
            return parseCanonicalEvent({
                ...base,
                type,
                payload: {
                    assignmentId: entityId,
                    employeeId: String(payload.employeeId ?? ""),
                    positionId: String(payload.positionId ?? "")
                }
            });
        case "AssignmentEnded":
            return parseCanonicalEvent({
                ...base,
                type,
                payload: {
                    assignmentId: entityId,
                    fromState: payload.from ? String(payload.from) : undefined,
                    toState: payload.to ? String(payload.to) : undefined
                }
            });
        case "CredentialIssued":
            return parseCanonicalEvent({
                ...base,
                type,
                payload: {
                    credentialId: entityId,
                    employeeId: String(payload.employeeId ?? ""),
                    credentialType: String(payload.type ?? payload.credentialType ?? ""),
                    expiryDate: payload.expiryDate ? String(payload.expiryDate) : undefined
                }
            });
        case "CredentialExpired":
        case "CredentialRevoked":
            return parseCanonicalEvent({
                ...base,
                type,
                payload: {
                    credentialId: entityId,
                    fromStatus: payload.from ? String(payload.from) : undefined,
                    toStatus: payload.to ? String(payload.to) : undefined
                }
            });
        case "AuthorityRuleCreated":
            return parseCanonicalEvent({
                ...base,
                type,
                payload: {
                    ruleId: entityId,
                    domain: String(payload.domain ?? ""),
                    threshold: Number(payload.threshold),
                    requiredTier: Number(payload.requiredTier)
                }
            });
        default:
            return null;
    }
}
