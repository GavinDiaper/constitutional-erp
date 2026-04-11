"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.canonicalEventSchema = exports.authorityRuleCreatedSchema = exports.credentialRevokedSchema = exports.credentialExpiredSchema = exports.credentialIssuedSchema = exports.assignmentEndedSchema = exports.assignmentCreatedSchema = exports.positionCreatedSchema = exports.employeeReturnedSchema = exports.employeeOnLeaveSchema = exports.employeeTerminatedSchema = exports.employeeHiredSchema = void 0;
const zod_1 = require("zod");
const authorityDomainSchema = zod_1.z.union([zod_1.z.literal("O2C"), zod_1.z.literal("P2P"), zod_1.z.literal("R2R"), zod_1.z.literal("H2R")]);
const eventBaseSchema = zod_1.z.object({
    entityId: zod_1.z.string().min(1),
    version: zod_1.z.number().int().min(1),
    occurredAt: zod_1.z.string().min(1),
    sourceEventId: zod_1.z.string().min(1)
});
exports.employeeHiredSchema = eventBaseSchema.extend({
    type: zod_1.z.literal("EmployeeHired"),
    payload: zod_1.z.object({
        employeeId: zod_1.z.string().min(1),
        name: zod_1.z.string().min(1),
        email: zod_1.z.string().email().optional()
    })
});
const employeeTransitionSchema = eventBaseSchema.extend({
    payload: zod_1.z.object({
        employeeId: zod_1.z.string().min(1),
        fromStatus: zod_1.z.string().min(1).optional(),
        toStatus: zod_1.z.string().min(1).optional()
    })
});
exports.employeeTerminatedSchema = employeeTransitionSchema.extend({ type: zod_1.z.literal("EmployeeTerminated") });
exports.employeeOnLeaveSchema = employeeTransitionSchema.extend({ type: zod_1.z.literal("EmployeeOnLeave") });
exports.employeeReturnedSchema = employeeTransitionSchema.extend({ type: zod_1.z.literal("EmployeeReturned") });
exports.positionCreatedSchema = eventBaseSchema.extend({
    type: zod_1.z.literal("PositionCreated"),
    payload: zod_1.z.object({
        positionId: zod_1.z.string().min(1),
        title: zod_1.z.string().min(1),
        department: zod_1.z.string().min(1),
        authorityDomain: authorityDomainSchema,
        authorityTier: zod_1.z.number().int().min(1).max(5)
    })
});
exports.assignmentCreatedSchema = eventBaseSchema.extend({
    type: zod_1.z.literal("AssignmentCreated"),
    payload: zod_1.z.object({
        assignmentId: zod_1.z.string().min(1),
        employeeId: zod_1.z.string().min(1),
        positionId: zod_1.z.string().min(1)
    })
});
exports.assignmentEndedSchema = eventBaseSchema.extend({
    type: zod_1.z.literal("AssignmentEnded"),
    payload: zod_1.z.object({
        assignmentId: zod_1.z.string().min(1),
        fromState: zod_1.z.string().min(1).optional(),
        toState: zod_1.z.string().min(1).optional()
    })
});
const credentialTransitionSchema = eventBaseSchema.extend({
    payload: zod_1.z.object({
        credentialId: zod_1.z.string().min(1),
        fromStatus: zod_1.z.string().min(1).optional(),
        toStatus: zod_1.z.string().min(1).optional()
    })
});
exports.credentialIssuedSchema = eventBaseSchema.extend({
    type: zod_1.z.literal("CredentialIssued"),
    payload: zod_1.z.object({
        credentialId: zod_1.z.string().min(1),
        employeeId: zod_1.z.string().min(1),
        credentialType: zod_1.z.string().min(1),
        expiryDate: zod_1.z.string().min(1).optional()
    })
});
exports.credentialExpiredSchema = credentialTransitionSchema.extend({ type: zod_1.z.literal("CredentialExpired") });
exports.credentialRevokedSchema = credentialTransitionSchema.extend({ type: zod_1.z.literal("CredentialRevoked") });
exports.authorityRuleCreatedSchema = eventBaseSchema.extend({
    type: zod_1.z.literal("AuthorityRuleCreated"),
    payload: zod_1.z.object({
        ruleId: zod_1.z.string().min(1),
        domain: authorityDomainSchema,
        threshold: zod_1.z.number(),
        requiredTier: zod_1.z.number().int().min(1).max(5)
    })
});
exports.canonicalEventSchema = zod_1.z.discriminatedUnion("type", [
    exports.employeeHiredSchema,
    exports.employeeTerminatedSchema,
    exports.employeeOnLeaveSchema,
    exports.employeeReturnedSchema,
    exports.positionCreatedSchema,
    exports.assignmentCreatedSchema,
    exports.assignmentEndedSchema,
    exports.credentialIssuedSchema,
    exports.credentialExpiredSchema,
    exports.credentialRevokedSchema,
    exports.authorityRuleCreatedSchema
]);
