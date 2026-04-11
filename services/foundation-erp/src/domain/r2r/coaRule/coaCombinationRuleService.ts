import { db, transaction } from "../../../db/connection";
import { appendEvent } from "../../../events/eventStore";
import { HttpError } from "../../../utils/errors";
import { newId } from "../../../utils/id";

function now(): string {
  return new Date().toISOString();
}

type RuleConditionInput = {
  segmentDefinitionId: string;
  expectedValue: string;
};

type SegmentValueInput = {
  segmentDefinitionId: string;
  value: string;
};

function ensureSegmentDefinitionExists(segmentDefinitionId: string) {
  const row = db
    .prepare("SELECT segment_definition_id FROM r2r_coa_segment_definition WHERE segment_definition_id = ?")
    .get(segmentDefinitionId);

  if (!row) {
    throw new HttpError(404, "not_found", "COA segment definition not found");
  }
}

function getRuleConditions(ruleId: string) {
  return db
    .prepare(
      `SELECT condition_id, segment_definition_id, expected_value
       FROM r2r_coa_combination_rule_condition
       WHERE rule_id = ?
       ORDER BY condition_id ASC`
    )
    .all(ruleId) as Array<{ condition_id: string; segment_definition_id: string; expected_value: string }>;
}

export function createCombinationRule(input: {
  name: string;
  description?: string;
  isActive?: boolean;
  conditions: RuleConditionInput[];
}) {
  if (input.conditions.length === 0) {
    throw new HttpError(400, "invalid_request", "Combination rule must include at least one condition");
  }

  const ruleId = newId("RULE-");
  const timestamp = now();

  transaction(() => {
    db.prepare(
      `INSERT INTO r2r_coa_combination_rule(rule_id, name, description, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(ruleId, input.name, input.description ?? null, input.isActive === false ? 0 : 1, timestamp, timestamp);

    const insertCondition = db.prepare(
      `INSERT INTO r2r_coa_combination_rule_condition(condition_id, rule_id, segment_definition_id, expected_value, created_at)
       VALUES (?, ?, ?, ?, ?)`
    );

    for (const condition of input.conditions) {
      ensureSegmentDefinitionExists(condition.segmentDefinitionId);
      insertCondition.run(
        newId("RULE-CND-"),
        ruleId,
        condition.segmentDefinitionId,
        condition.expectedValue,
        timestamp
      );
    }

    appendEvent({
      entityId: ruleId,
      entityType: "COACombinationRule",
      eventType: "coa-combination-rule.created",
      version: 1,
      payload: {
        name: input.name,
        conditions: input.conditions,
        isActive: input.isActive !== false
      }
    });
  });

  return getCombinationRuleById(ruleId);
}

export function getCombinationRuleById(ruleId: string) {
  const rule = db.prepare("SELECT * FROM r2r_coa_combination_rule WHERE rule_id = ?").get(ruleId) as
    | { rule_id: string }
    | undefined;

  if (!rule) {
    throw new HttpError(404, "not_found", "COA combination rule not found");
  }

  return {
    ...rule,
    conditions: getRuleConditions(ruleId)
  };
}

export function listCombinationRules() {
  const rules = db
    .prepare("SELECT * FROM r2r_coa_combination_rule ORDER BY created_at DESC LIMIT 200")
    .all() as Array<{ rule_id: string }>;

  return rules.map((rule) => ({
    ...rule,
    conditions: getRuleConditions(rule.rule_id)
  }));
}

export function validateCombination(input: { values: SegmentValueInput[] }) {
  const activeRules = db
    .prepare("SELECT rule_id, name FROM r2r_coa_combination_rule WHERE is_active = 1 ORDER BY created_at ASC")
    .all() as Array<{ rule_id: string; name: string }>;

  if (activeRules.length === 0) {
    return {
      valid: true,
      matchedRuleId: null,
      matchedRuleName: null,
      violations: []
    };
  }

  const bySegment = new Map<string, string>();
  for (const value of input.values) {
    bySegment.set(value.segmentDefinitionId, value.value);
  }

  for (const rule of activeRules) {
    const conditions = getRuleConditions(rule.rule_id);
    const matched = conditions.every((condition) => bySegment.get(condition.segment_definition_id) === condition.expected_value);
    if (matched) {
      return {
        valid: true,
        matchedRuleId: rule.rule_id,
        matchedRuleName: rule.name,
        violations: []
      };
    }
  }

  return {
    valid: false,
    matchedRuleId: null,
    matchedRuleName: null,
    violations: activeRules.map((rule) => ({
      ruleId: rule.rule_id,
      ruleName: rule.name,
      reason: "segment_combination_not_allowed"
    }))
  };
}
