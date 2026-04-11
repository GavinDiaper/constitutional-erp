-- Seed baseline legal entities and ledgers for R2R bootstrap flows.

INSERT OR IGNORE INTO r2r_legal_entity (
  legal_entity_id,
  name,
  currency_code,
  locale,
  parent_legal_entity_id,
  created_at,
  updated_at
)
VALUES
  (
    'LE-SEED-US',
    'Constitutional Holdings US',
    'USD',
    'en-US',
    NULL,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'LE-SEED-AU',
    'Constitutional Holdings AU',
    'AUD',
    'en-AU',
    NULL,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  );

INSERT OR IGNORE INTO r2r_ledger (
  ledger_id,
  name,
  currency_code,
  calendar,
  chart_of_accounts_ref,
  legal_entity_id,
  created_at,
  updated_at
)
VALUES
  (
    'LGR-SEED-US',
    'Primary US Ledger',
    'USD',
    'Gregorian',
    'CORE-COA',
    'LE-SEED-US',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'LGR-SEED-AU',
    'Primary AU Ledger',
    'AUD',
    'Gregorian',
    'CORE-COA',
    'LE-SEED-AU',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  );
