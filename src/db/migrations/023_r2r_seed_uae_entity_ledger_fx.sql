-- Seed UAE legal entity, ledger, and FX rate (1 USD = 0.25 AED).

INSERT OR IGNORE INTO r2r_legal_entity (
  legal_entity_id,
  name,
  currency_code,
  locale,
  parent_legal_entity_id,
  created_at,
  updated_at
)
VALUES (
  'LE-SEED-AE',
  'Constitutional Holdings UAE',
  'AED',
  'en-AE',
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
VALUES (
  'LGR-SEED-AE',
  'Primary AE Ledger',
  'AED',
  'Gregorian',
  'CORE-COA',
  'LE-SEED-AE',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);

-- Seed a SPOT FX rate type used for the baseline currency pair.
INSERT OR IGNORE INTO r2r_fx_rate_type (
  rate_type_id,
  code,
  name,
  description,
  created_at,
  updated_at
)
VALUES (
  'FXT-SEED-SPOT',
  'SPOT',
  'Spot Rate',
  'Baseline spot exchange rate for seed data',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);

-- 1 USD = 0.25 AED effective from beginning of system.
INSERT OR IGNORE INTO r2r_fx_rate (
  rate_id,
  rate_type_id,
  from_currency,
  to_currency,
  rate,
  valid_from,
  valid_to,
  created_at,
  updated_at
)
VALUES (
  'FXR-SEED-USD-AED',
  'FXT-SEED-SPOT',
  'USD',
  'AED',
  0.25,
  '2018-01-01T00:00:00.000Z',
  NULL,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);
