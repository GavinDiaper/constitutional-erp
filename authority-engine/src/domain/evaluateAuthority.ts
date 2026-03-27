import { db } from "../db/connection";
import { appendAuthorityEvent } from "../events/eventStore";
import { HttpError } from "../utils/errors";

type AuthorityDomain = "O2C" | "P2P" | "R2R" | "H2R";

export interface AuthorityCheckInput {
  actorId: string;
  action: string;
  domain: AuthorityDomain;
  context?: Record<string, unknown>;
}

export interface AuthorityCheckResult {
  allowed: boolean;
  effectiveTier?: number;
  requiredTier?: number;
  reasons: string[];
}

const credentialRequirementByAction: Record<string, string> = {
  approve: "FinancialApproval"
};

export function evaluateAuthority(input: AuthorityCheckInput): AuthorityCheckResult {
  const subject = db
    .prepare("SELECT employee_id, status FROM authority_subject WHERE employee_id = ?")
    .get(input.actorId) as { employee_id: string; status: "Active" | "OnLeave" | "Terminated" } | undefined;

  if (!subject) {
    const reasons = [`Authority subject ${input.actorId} not found`];

    appendAuthorityEvent({
      entityId: input.actorId,
      entityType: "AuthorityEvaluation",
      eventType: "AuthorityEvaluationPerformed",
      version: 1,
      payload: {
        actorId: input.actorId,
        action: input.action,
        domain: input.domain,
        allowed: false,
        effectiveTier: 0,
        requiredTier: 0,
        reasons
      }
    });

    return {
      allowed: false,
      effectiveTier: 0,
      requiredTier: 0,
      reasons
    };
  }

  const reasons: string[] = [];

  const tierRow = db
    .prepare(
      `SELECT MAX(authority_tier) as tier
       FROM authority_position
       WHERE employee_id = ? AND authority_domain = ? AND active = 1`
    )
    .get(input.actorId, input.domain) as { tier: number | null };

  const effectiveTier = tierRow.tier ?? 0;
  if (effectiveTier <= 0) {
    reasons.push(`Actor has no active authority tier in ${input.domain}`);
  }

  const amountRaw = input.context?.amount;
  const amount = typeof amountRaw === "number" ? amountRaw : Number.NaN;

  const rules = db
    .prepare("SELECT threshold, required_tier FROM authority_rule WHERE domain = ? ORDER BY required_tier ASC")
    .all(input.domain) as Array<{ threshold: number; required_tier: number }>;

  const matchedRules = Number.isFinite(amount) ? rules.filter((rule) => amount > rule.threshold) : [];
  const requiredTier = matchedRules.reduce((max, rule) => Math.max(max, rule.required_tier), 0);

  if (requiredTier > 0) {
    if (effectiveTier >= requiredTier) {
      reasons.push(`Tier ${effectiveTier} meets threshold for ${input.domain} action`);
    } else {
      reasons.push(`Actor has Tier ${effectiveTier} but Tier ${requiredTier} is required`);
    }
  }

  let credentialSatisfied = true;
  const requiredCredential = credentialRequirementByAction[input.action];
  if (requiredCredential) {
    const credentialRow = db
      .prepare(
        `SELECT credential_id FROM authority_credential
         WHERE employee_id = ? AND credential_type = ? AND status = 'Valid'
         LIMIT 1`
      )
      .get(input.actorId, requiredCredential);

    credentialSatisfied = Boolean(credentialRow);
    if (!credentialSatisfied) {
      reasons.push(`Missing valid credential ${requiredCredential}`);
    }
  }

  const isActive = subject.status === "Active";
  if (!isActive) {
    reasons.push(`Actor status ${subject.status} is not eligible for authority execution`);
  }

  const allowed = isActive && effectiveTier >= requiredTier && credentialSatisfied;

  appendAuthorityEvent({
    entityId: input.actorId,
    entityType: "AuthorityEvaluation",
    eventType: "AuthorityEvaluationPerformed",
    version: 1,
    payload: {
      actorId: input.actorId,
      action: input.action,
      domain: input.domain,
      allowed,
      effectiveTier,
      requiredTier,
      reasons
    }
  });

  return {
    allowed,
    effectiveTier,
    requiredTier,
    reasons
  };
}
