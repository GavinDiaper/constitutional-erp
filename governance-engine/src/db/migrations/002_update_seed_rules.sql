INSERT INTO governance_rule(
  rule_id,
  domain,
  description,
  condition_json,
  effect_json,
  priority,
  is_active,
  created_at,
  updated_at
) VALUES
(
  'SOD-001',
  'P2P',
  'Prevent self-approval for requisition approvals in P2P',
  '{"type":"And","conditions":[{"type":"ActionIs","action":"p2p_requisition_approved"},{"type":"ActorIsRequester"}]}',
  '{"type":"Deny","reason":"SelfApprovalNotAllowed"}',
  10,
  1,
  datetime('now'),
  datetime('now')
),
(
  'P2P-THRESHOLD-001',
  'P2P',
  'Require Tier 3 approval for purchase orders over 10000',
  '{"type":"And","conditions":[{"type":"ActionIs","action":"p2p_purchase_order_issued"},{"type":"AmountGreaterThan","amount":10000},{"type":"TierLessThan","tier":3}]}',
  '{"type":"RequireApproval","approverTier":3,"reason":"TierTooLowForThreshold"}',
  20,
  1,
  datetime('now'),
  datetime('now')
),
(
  'P2P-THRESHOLD-002',
  'P2P',
  'Escalate purchase orders over 50000 to Tier 4',
  '{"type":"And","conditions":[{"type":"ActionIs","action":"p2p_purchase_order_issued"},{"type":"AmountGreaterThan","amount":50000},{"type":"TierLessThan","tier":4}]}',
  '{"type":"Escalate","toTier":4,"reason":"EscalateHighValueApproval"}',
  30,
  1,
  datetime('now'),
  datetime('now')
),
(
  'RISK-001',
  'GLOBAL',
  'Flag risk for high-value actions over 25000',
  '{"type":"AmountGreaterThan","amount":25000}',
  '{"type":"FlagRisk","level":"High","reason":"HighValueAction"}',
  40,
  1,
  datetime('now'),
  datetime('now')
)
ON CONFLICT(rule_id) DO UPDATE SET
  domain = excluded.domain,
  description = excluded.description,
  condition_json = excluded.condition_json,
  effect_json = excluded.effect_json,
  priority = excluded.priority,
  is_active = excluded.is_active,
  updated_at = datetime('now');
