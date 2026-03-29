import { db, transaction } from "../../../db/connection";
import { appendEvent, EventActor } from "../../../events/eventStore";
import { newId } from "../../../utils/id";
import { HttpError } from "../../../utils/errors";

type AuthorityDomain = "O2C" | "P2P" | "R2R" | "H2R";

function now(): string {
  return new Date().toISOString();
}

export function getAuthorityRuleById(ruleId: string) {
  const row = db.prepare("SELECT * FROM h2r_authority_rule WHERE rule_id = ?").get(ruleId);
  if (!row) {
    throw new HttpError(404, "not_found", "Authority rule not found");
  }

  return row;
}

export function listAuthorityRules(domain?: AuthorityDomain) {
  if (domain) {
    return db
      .prepare("SELECT * FROM h2r_authority_rule WHERE domain = ? ORDER BY threshold ASC, required_tier ASC")
      .all(domain);
  }

  return db.prepare("SELECT * FROM h2r_authority_rule ORDER BY domain ASC, threshold ASC, required_tier ASC").all();
}

export function createAuthorityRule(
  input: {
  domain: AuthorityDomain;
  threshold: number;
  requiredTier: number;
  },
  actor?: EventActor
) {
  if (!Number.isFinite(input.threshold) || input.threshold < 0) {
    throw new HttpError(400, "invalid_request", "threshold must be a non-negative number");
  }

  if (!Number.isInteger(input.requiredTier) || input.requiredTier < 1 || input.requiredTier > 5) {
    throw new HttpError(400, "invalid_request", "requiredTier must be an integer between 1 and 5");
  }

  const ruleId = newId("RULE-");
  const timestamp = now();

  transaction(() => {
    db.prepare(
      `INSERT INTO h2r_authority_rule(rule_id, domain, threshold, required_tier, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(ruleId, input.domain, input.threshold, input.requiredTier, timestamp, timestamp);

    appendEvent({
      entityId: ruleId,
      entityType: "AuthorityRule",
      eventType: "authority-rule.created",
      version: 1,
      payload: input as Record<string, unknown>,
      actor
    });
  });

  return getAuthorityRuleById(ruleId);
}
