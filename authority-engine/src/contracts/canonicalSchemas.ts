import { z } from "zod";

const authorityDomainSchema = z.union([z.literal("O2C"), z.literal("P2P"), z.literal("R2R"), z.literal("H2R")]);

const eventBaseSchema = z.object({
  entityId: z.string().min(1),
  version: z.number().int().min(1),
  occurredAt: z.string().min(1),
  sourceEventId: z.string().min(1)
});

export const employeeHiredSchema = eventBaseSchema.extend({
  type: z.literal("EmployeeHired"),
  payload: z.object({
    employeeId: z.string().min(1),
    name: z.string().min(1),
    email: z.string().email().optional()
  })
});

const employeeTransitionSchema = eventBaseSchema.extend({
  payload: z.object({
    employeeId: z.string().min(1),
    fromStatus: z.string().min(1).optional(),
    toStatus: z.string().min(1).optional()
  })
});

export const employeeTerminatedSchema = employeeTransitionSchema.extend({ type: z.literal("EmployeeTerminated") });
export const employeeOnLeaveSchema = employeeTransitionSchema.extend({ type: z.literal("EmployeeOnLeave") });
export const employeeReturnedSchema = employeeTransitionSchema.extend({ type: z.literal("EmployeeReturned") });

export const positionCreatedSchema = eventBaseSchema.extend({
  type: z.literal("PositionCreated"),
  payload: z.object({
    positionId: z.string().min(1),
    title: z.string().min(1),
    department: z.string().min(1),
    authorityDomain: authorityDomainSchema,
    authorityTier: z.number().int().min(1).max(5)
  })
});

export const assignmentCreatedSchema = eventBaseSchema.extend({
  type: z.literal("AssignmentCreated"),
  payload: z.object({
    assignmentId: z.string().min(1),
    employeeId: z.string().min(1),
    positionId: z.string().min(1)
  })
});

export const assignmentEndedSchema = eventBaseSchema.extend({
  type: z.literal("AssignmentEnded"),
  payload: z.object({
    assignmentId: z.string().min(1),
    fromState: z.string().min(1).optional(),
    toState: z.string().min(1).optional()
  })
});

const credentialTransitionSchema = eventBaseSchema.extend({
  payload: z.object({
    credentialId: z.string().min(1),
    fromStatus: z.string().min(1).optional(),
    toStatus: z.string().min(1).optional()
  })
});

export const credentialIssuedSchema = eventBaseSchema.extend({
  type: z.literal("CredentialIssued"),
  payload: z.object({
    credentialId: z.string().min(1),
    employeeId: z.string().min(1),
    credentialType: z.string().min(1),
    expiryDate: z.string().min(1).optional()
  })
});

export const credentialExpiredSchema = credentialTransitionSchema.extend({ type: z.literal("CredentialExpired") });
export const credentialRevokedSchema = credentialTransitionSchema.extend({ type: z.literal("CredentialRevoked") });

export const authorityRuleCreatedSchema = eventBaseSchema.extend({
  type: z.literal("AuthorityRuleCreated"),
  payload: z.object({
    ruleId: z.string().min(1),
    domain: authorityDomainSchema,
    threshold: z.number(),
    requiredTier: z.number().int().min(1).max(5)
  })
});

export const canonicalEventSchema = z.discriminatedUnion("type", [
  employeeHiredSchema,
  employeeTerminatedSchema,
  employeeOnLeaveSchema,
  employeeReturnedSchema,
  positionCreatedSchema,
  assignmentCreatedSchema,
  assignmentEndedSchema,
  credentialIssuedSchema,
  credentialExpiredSchema,
  credentialRevokedSchema,
  authorityRuleCreatedSchema
]);
