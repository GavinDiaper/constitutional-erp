import { z } from "zod";
import { db } from "../db/connection";
import { appendGovernanceDecisionLog, appendGovernanceEvent } from "../events/eventStore";

const governanceDomainSchema = z.union([z.literal("O2C"), z.literal("P2P"), z.literal("R2R"), z.literal("H2R")]);
const riskLevelSchema = z.union([z.literal("Low"), z.literal("Medium"), z.literal("High")]);

const authorityDecisionSchema = z.object({
  allowed: z.boolean(),
  effectiveTier: z.number().int().min(0).max(5).optional(),
  requiredTier: z.number().int().min(0).max(5).optional(),
  reasons: z.array(z.string().min(1)).default([])
});

const p2pContextSchema = z
  .object({
    requesterId: z.string().min(1),
    amount: z.number().finite().nonnegative(),
    currency: z.string().length(3).optional(),
    credentialType: z.string().min(1).optional()
  })
  .passthrough();

const o2cContextSchema = z
  .object({
    requesterId: z.string().min(1),
    amount: z.number().finite().nonnegative(),
    customerRisk: z.union([z.literal("Low"), z.literal("Medium"), z.literal("High")]).optional(),
    credentialType: z.string().min(1).optional()
  })
  .passthrough();

const r2rContextSchema = z
  .object({
    requesterId: z.string().min(1),
    amount: z.number().finite().nonnegative(),
    journalType: z.string().min(1),
    credentialType: z.string().min(1).optional()
  })
  .passthrough();

const h2rContextSchema = z
  .object({
    requesterId: z.string().min(1),
    employeeId: z.string().min(1).optional(),
    credentialType: z.string().min(1).optional()
  })
  .passthrough();

export const governanceCheckInputSchema = z.discriminatedUnion("domain", [
  z.object({
    actorId: z.string().min(1),
    action: z.string().min(1),
    domain: z.literal("P2P"),
    context: p2pContextSchema,
    authorityDecision: authorityDecisionSchema
  }),
  z.object({
    actorId: z.string().min(1),
    action: z.string().min(1),
    domain: z.literal("O2C"),
    context: o2cContextSchema,
    authorityDecision: authorityDecisionSchema
  }),
  z.object({
    actorId: z.string().min(1),
    action: z.string().min(1),
    domain: z.literal("R2R"),
    context: r2rContextSchema,
    authorityDecision: authorityDecisionSchema
  }),
  z.object({
    actorId: z.string().min(1),
    action: z.string().min(1),
    domain: z.literal("H2R"),
    context: h2rContextSchema,
    authorityDecision: authorityDecisionSchema
  })
]);

type GovernanceCheckInput = z.infer<typeof governanceCheckInputSchema>;

export interface GovernanceCheckResult {
  allowed: boolean;
  requiresApproval: boolean;
  requiredApproverTier?: number;
  escalatedToTier?: number;
  riskLevel?: z.infer<typeof riskLevelSchema>;
  violations: string[];
  constraints: string[];
  matchedRules: string[];
}

type GovernanceCondition =
  | { type: "Always" }
  | { type: "ActionIs"; action: string }
  | { type: "AmountGreaterThan"; amount: number }
  | { type: "ActorIsRequester" }
  | { type: "CredentialRequired"; credentialType: string }
  | { type: "TierLessThan"; tier: number }
  | { type: "DomainIs"; domain: z.infer<typeof governanceDomainSchema> }
  | { type: "And"; conditions: GovernanceCondition[] }
  | { type: "Or"; conditions: GovernanceCondition[] };

type GovernanceEffect =
  | { type: "Allow" }
  | { type: "Deny"; reason: string }
  | { type: "RequireApproval"; approverTier: number; reason: string }
  | { type: "Escalate"; toTier: number; reason: string }
  | { type: "FlagRisk"; level: z.infer<typeof riskLevelSchema>; reason: string };

const conditionSchema: z.ZodType<GovernanceCondition> = z.lazy(() =>
  z.discriminatedUnion("type", [
    z.object({ type: z.literal("Always") }),
    z.object({ type: z.literal("ActionIs"), action: z.string().min(1) }),
    z.object({ type: z.literal("AmountGreaterThan"), amount: z.number().finite() }),
    z.object({ type: z.literal("ActorIsRequester") }),
    z.object({ type: z.literal("CredentialRequired"), credentialType: z.string().min(1) }),
    z.object({ type: z.literal("TierLessThan"), tier: z.number().int().min(0).max(5) }),
    z.object({ type: z.literal("DomainIs"), domain: governanceDomainSchema }),
    z.object({ type: z.literal("And"), conditions: z.array(conditionSchema).min(1) }),
    z.object({ type: z.literal("Or"), conditions: z.array(conditionSchema).min(1) })
  ])
);

const effectSchema: z.ZodType<GovernanceEffect> = z.discriminatedUnion("type", [
  z.object({ type: z.literal("Allow") }),
  z.object({ type: z.literal("Deny"), reason: z.string().min(1) }),
  z.object({
    type: z.literal("RequireApproval"),
    approverTier: z.number().int().min(1).max(5),
    reason: z.string().min(1)
  }),
  z.object({
    type: z.literal("Escalate"),
    toTier: z.number().int().min(1).max(5),
    reason: z.string().min(1)
  }),
  z.object({ type: z.literal("FlagRisk"), level: riskLevelSchema, reason: z.string().min(1) })
]);

interface StoredRule {
  rule_id: string;
  condition_json: string;
  effect_json: string;
}

class MissingDataError extends Error {}

function getContextNumber(input: GovernanceCheckInput, key: "amount"): number {
  if (!(key in input.context)) {
    throw new MissingDataError(`Missing required numeric context field: ${key}`);
  }

  const value = input.context[key as keyof typeof input.context];
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new MissingDataError(`Missing required numeric context field: ${key}`);
  }

  return value;
}

function hasCredential(actorId: string, credentialType: string): boolean {
  const row = db
    .prepare(
      `SELECT credential_type
       FROM governance_actor_credential
       WHERE actor_id = ? AND credential_type = ? AND status = 'Valid'
       LIMIT 1`
    )
    .get(actorId, credentialType);

  return Boolean(row);
}

function evalCondition(condition: GovernanceCondition, input: GovernanceCheckInput): boolean {
  switch (condition.type) {
    case "Always":
      return true;
    case "ActionIs":
      return input.action === condition.action;
    case "AmountGreaterThan":
      return getContextNumber(input, "amount") > condition.amount;
    case "ActorIsRequester":
      return input.actorId === input.context.requesterId;
    case "CredentialRequired":
      return hasCredential(input.actorId, condition.credentialType);
    case "TierLessThan":
      return (input.authorityDecision.effectiveTier ?? 0) < condition.tier;
    case "DomainIs":
      return input.domain === condition.domain;
    case "And":
      return condition.conditions.every((item) => evalCondition(item, input));
    case "Or":
      return condition.conditions.some((item) => evalCondition(item, input));
  }
}

function readRules(domain: GovernanceCheckInput["domain"]): Array<{ ruleId: string; condition: GovernanceCondition; effect: GovernanceEffect }> {
  const rows = db
    .prepare(
      `SELECT rule_id, condition_json, effect_json
       FROM governance_rule
       WHERE is_active = 1 AND domain IN (?, 'GLOBAL')
       ORDER BY priority ASC, rule_id ASC`
    )
    .all(domain) as StoredRule[];

  return rows.map((row) => ({
    ruleId: row.rule_id,
    condition: conditionSchema.parse(JSON.parse(row.condition_json)),
    effect: effectSchema.parse(JSON.parse(row.effect_json))
  }));
}

function riskRank(level: z.infer<typeof riskLevelSchema>): number {
  if (level === "High") {
    return 3;
  }
  if (level === "Medium") {
    return 2;
  }
  return 1;
}

function isCreateOrInitiateAction(action: string): boolean {
  const normalized = action.trim().toLowerCase();
  return /(^|[._:-])(create|initiate)($|[._:-])/.test(normalized);
}

function conditionHasRiskGate(condition: GovernanceCondition): boolean {
  switch (condition.type) {
    case "AmountGreaterThan":
    case "TierLessThan":
    case "CredentialRequired":
      return true;
    case "And":
    case "Or":
      return condition.conditions.some((item) => conditionHasRiskGate(item));
    default:
      return false;
  }
}

function hasExplicitConstitutionalMandate(reason: string): boolean {
  return /constitutional[_\s-]?mandate/i.test(reason);
}

function buildResult(input: GovernanceCheckInput): GovernanceCheckResult {
  if (!input.authorityDecision.allowed) {
    return {
      allowed: false,
      requiresApproval: false,
      violations: ["AuthorityEngineDenied"],
      constraints: [],
      matchedRules: []
    };
  }

  const rules = readRules(input.domain);
  const matchedRules: string[] = [];
  const violations: string[] = [];
  const constraints: string[] = [];
  let hasDeny = false;
  let hasRequireApproval = false;
  let hasEscalate = false;
  let requiredApproverTier: number | undefined;
  let escalatedToTier: number | undefined;
  let riskLevel: z.infer<typeof riskLevelSchema> | undefined;

  for (const rule of rules) {
    try {
      if (!evalCondition(rule.condition, input)) {
        continue;
      }
    } catch (error) {
      if (error instanceof MissingDataError) {
        // Missing optional context should not hard-deny unrelated actions.
        // Skip this rule evaluation and continue with other applicable rules.
        constraints.push(`SkippedRuleMissingContext:${rule.ruleId}`);
        continue;
      }

      throw error;
    }

    matchedRules.push(rule.ruleId);

    switch (rule.effect.type) {
      case "Allow":
        break;
      case "Deny":
        hasDeny = true;
        violations.push(rule.effect.reason);
        break;
      case "RequireApproval":
        if (
          isCreateOrInitiateAction(input.action)
          && !conditionHasRiskGate(rule.condition)
          && !hasExplicitConstitutionalMandate(rule.effect.reason)
        ) {
          constraints.push("CreateOrInitiateDefaultsNoApproval");
          break;
        }

        hasRequireApproval = true;
        requiredApproverTier = Math.max(requiredApproverTier ?? 0, rule.effect.approverTier);
        constraints.push(rule.effect.reason);
        break;
      case "Escalate":
        hasEscalate = true;
        escalatedToTier = Math.max(escalatedToTier ?? 0, rule.effect.toTier);
        constraints.push(rule.effect.reason);
        break;
      case "FlagRisk":
        if (!riskLevel || riskRank(rule.effect.level) > riskRank(riskLevel)) {
          riskLevel = rule.effect.level;
        }
        constraints.push(rule.effect.reason);
        break;
    }
  }

  if (hasDeny) {
    return {
      allowed: false,
      requiresApproval: false,
      requiredApproverTier: undefined,
      escalatedToTier: undefined,
      riskLevel,
      violations,
      constraints,
      matchedRules
    };
  }

  if (hasRequireApproval) {
    return {
      allowed: false,
      requiresApproval: true,
      requiredApproverTier,
      escalatedToTier,
      riskLevel,
      violations,
      constraints,
      matchedRules
    };
  }

  if (hasEscalate) {
    return {
      allowed: false,
      requiresApproval: false,
      requiredApproverTier: undefined,
      escalatedToTier,
      riskLevel,
      violations,
      constraints,
      matchedRules
    };
  }

  return {
    allowed: true,
    requiresApproval: false,
    requiredApproverTier: undefined,
    escalatedToTier,
    riskLevel,
    violations,
    constraints,
    matchedRules
  };
}

export function evaluateGovernance(input: GovernanceCheckInput): GovernanceCheckResult {
  const evaluatedAt = new Date().toISOString();
  const result = buildResult(input);

  appendGovernanceDecisionLog({
    actorId: input.actorId,
    action: input.action,
    domain: input.domain,
    decision: result.allowed ? "Allow" : "Deny",
    requiresApproval: result.requiresApproval,
    requiredApproverTier: result.requiredApproverTier,
    escalatedToTier: result.escalatedToTier,
    riskLevel: result.riskLevel,
    violations: result.violations,
    matchedRules: result.matchedRules,
    timestamp: evaluatedAt
  });

  appendGovernanceEvent({
    entityId: input.actorId,
    entityType: "GovernanceEvaluation",
    eventType: "GovernanceEvaluationPerformed",
    version: 1,
    payload: {
      actorId: input.actorId,
      action: input.action,
      domain: input.domain,
      authorityDecision: input.authorityDecision,
      result
    }
  });

  if (result.violations.length > 0) {
    appendGovernanceEvent({
      entityId: input.actorId,
      entityType: "Governance",
      eventType: "GovernanceViolationDetected",
      version: 1,
      payload: {
        actorId: input.actorId,
        action: input.action,
        domain: input.domain,
        violations: result.violations
      }
    });
  }

  if (result.constraints.length > 0 || result.requiresApproval || result.escalatedToTier || result.riskLevel) {
    appendGovernanceEvent({
      entityId: input.actorId,
      entityType: "Governance",
      eventType: "GovernanceConstraintApplied",
      version: 1,
      payload: {
        actorId: input.actorId,
        action: input.action,
        domain: input.domain,
        requiresApproval: result.requiresApproval,
        requiredTier: result.requiredApproverTier,
        escalatedToTier: result.escalatedToTier,
        riskLevel: result.riskLevel,
        constraints: result.constraints
      }
    });
  }

  return result;
}
