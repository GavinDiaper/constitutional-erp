export type TaxApplicability =
  | 'taxable'
  | 'exempt'
  | 'zero-rated'
  | 'reverse-charge'
  | 'withholding';

export type TaxAccountRole =
  | 'tax_liability'
  | 'tax_recoverable'
  | 'withholding_payable';

export type TaxTransactionType =
  | 'ar-invoice'
  | 'ar-credit-memo'
  | 'ap-invoice'
  | 'ap-credit-memo'
  | 'ap-payment';

export type TaxAccountingStatus =
  | 'pending'
  | 'posted'
  | 'settled'
  | 'reconciled';

export interface TaxDetermination {
  taxRegimeId: string;
  taxCodeId: string;
  taxCode: string;
  taxApplicability: TaxApplicability;
  taxRateId: string | null;
  taxRuleId: string | null;
  jurisdictionId: string | null;
  ratePercent: number;
  inclusiveFlag: boolean;
}

export interface TaxCalculation {
  taxableAmount: number;
  taxAmount: number;
  grossAmount: number;
  ratePercent: number;
  inclusiveFlag: boolean;
}

export interface TaxTransactionLineInput {
  sourceDomain: string;
  sourceEntityType: string;
  sourceEntityId: string;
  sourceEventId?: string;
  legalEntityId?: string;
  taxRegimeId: string;
  taxJurisdictionId?: string;
  taxCodeId: string;
  taxRateId?: string;
  taxRuleId?: string;
  transactionType: TaxTransactionType;
  taxApplicability: TaxApplicability;
  taxableAmount: number;
  taxAmount: number;
  currencyCode: string;
}

export interface TaxTransactionLineRow {
  tax_transaction_line_id: string;
  source_domain: string;
  source_entity_type: string;
  source_entity_id: string;
  source_event_id: string | null;
  legal_entity_id: string | null;
  tax_regime_id: string;
  tax_jurisdiction_id: string | null;
  tax_code_id: string;
  tax_rate_id: string | null;
  tax_rule_id: string | null;
  transaction_type: string;
  tax_applicability: TaxApplicability;
  taxable_amount: number;
  tax_amount: number;
  currency_code: string;
  posting_profile_id: string | null;
  accounting_status: TaxAccountingStatus;
  accounting_journal_id: string | null;
  accounting_line_side: string | null;
  created_at: string;
  updated_at: string;
}
