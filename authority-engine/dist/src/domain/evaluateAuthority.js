"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluateAuthority = evaluateAuthority;
const connection_1 = require("../db/connection");
const eventStore_1 = require("../events/eventStore");
const errors_1 = require("../utils/errors");
const credentialRequirementByAction = {
    approve: "FinancialApproval"
};
function evaluateAuthority(input) {
    const subject = connection_1.db
        .prepare("SELECT employee_id, status FROM authority_subject WHERE employee_id = ?")
        .get(input.actorId);
    if (!subject) {
        throw new errors_1.HttpError(404, "not_found", "Authority subject not found");
    }
    const reasons = [];
    const tierRow = connection_1.db
        .prepare(`SELECT MAX(authority_tier) as tier
       FROM authority_position
       WHERE employee_id = ? AND authority_domain = ? AND active = 1`)
        .get(input.actorId, input.domain);
    const effectiveTier = tierRow.tier ?? 0;
    if (effectiveTier <= 0) {
        reasons.push(`Actor has no active authority tier in ${input.domain}`);
    }
    const amountRaw = input.context?.amount;
    const amount = typeof amountRaw === "number" ? amountRaw : Number.NaN;
    const rules = connection_1.db
        .prepare("SELECT threshold, required_tier FROM authority_rule WHERE domain = ? ORDER BY required_tier ASC")
        .all(input.domain);
    const matchedRules = Number.isFinite(amount) ? rules.filter((rule) => amount > rule.threshold) : [];
    const requiredTier = matchedRules.reduce((max, rule) => Math.max(max, rule.required_tier), 0);
    if (requiredTier > 0) {
        if (effectiveTier >= requiredTier) {
            reasons.push(`Tier ${effectiveTier} meets threshold for ${input.domain} action`);
        }
        else {
            reasons.push(`Actor has Tier ${effectiveTier} but Tier ${requiredTier} is required`);
        }
    }
    let credentialSatisfied = true;
    const requiredCredential = credentialRequirementByAction[input.action];
    if (requiredCredential) {
        const credentialRow = connection_1.db
            .prepare(`SELECT credential_id FROM authority_credential
         WHERE employee_id = ? AND credential_type = ? AND status = 'Valid'
         LIMIT 1`)
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
    (0, eventStore_1.appendAuthorityEvent)({
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
