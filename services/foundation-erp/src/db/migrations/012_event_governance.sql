-- Migration 012: Enhance event metadata with governance context

-- ── Foundation ERP Event Table Enhancement ──────────────────────────────────

ALTER TABLE event ADD COLUMN governance_json TEXT;

CREATE INDEX IF NOT EXISTS idx_event_governance ON event(governance_json);

-- ── Add governance tracking to event table ───────────────────────────────────

-- Update comments to document new field
-- governance_json: { riskLevel, requiredTier, governanceTag, requiredApproval, approverTier }
