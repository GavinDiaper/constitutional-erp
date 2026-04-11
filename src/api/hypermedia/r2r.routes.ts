import { Router } from "express";
import { z } from "zod";
import { validateBody } from "../../middleware/validate";
import { entityWithLinks } from "../../utils/hypermedia";
import { HttpError } from "../../utils/errors";
import {
  addJournalLine,
  createJournal,
  getJournalById,
  getTrialBalance,
  listJournals,
  postJournal,
  reverseJournal,
  cancelJournal
} from "../../domain/r2r/journal/journalService";
import {
  ACCOUNT_TYPES,
  createAccount,
  createSegmentDefinition,
  getAccountById,
  getSegmentDefinitionById,
  listAccountHierarchy,
  listAccountSegments,
  listAccounts,
  listSegmentDefinitions,
  setAccountSegments
} from "../../domain/r2r/account/accountService";
import {
  createFiscalPeriod,
  createFiscalYear,
  getFiscalPeriodById,
  getFiscalYearById,
  listFiscalPeriods,
  listFiscalYears,
  startYearClose,
  closeFiscalYear,
  startPeriodClose,
  closePeriod,
  lockPeriod
} from "../../domain/r2r/fiscal/fiscalService";
import {
  createLedger,
  getLedgerById,
  listLedgers
} from "../../domain/r2r/ledger/ledgerService";
import {
  createLegalEntity,
  getLegalEntityById,
  listLegalEntities
} from "../../domain/r2r/legalEntity/legalEntityService";
import {
  addLedgerToSet,
  createLedgerSet,
  getLedgerSetById,
  listLedgerSetMembers,
  listLedgerSets
} from "../../domain/r2r/ledgerSet/ledgerSetService";
import {
  createCombinationRule,
  getCombinationRuleById,
  listCombinationRules,
  validateCombination
} from "../../domain/r2r/coaRule/coaCombinationRuleService";
import {
  createFxRate,
  createFxRateType,
  getFxRateById,
  getFxRateTypeById,
  getLatestFxRate,
  listFxRates,
  listFxRateTypes
} from "../../domain/r2r/fx/fxService";
import {
  createPostingProfile,
  getPostingProfileById,
  listPostingProfiles,
  setPostingProfileActiveState
} from "../../domain/r2r/sla/postingProfileService";
import {
  createTaxRegime,
  getTaxRegimeById,
  listTaxRegimes,
  createTaxJurisdiction,
  getTaxJurisdictionById,
  listTaxJurisdictions,
  createTaxCode,
  getTaxCodeById,
  listTaxCodes,
  createTaxRate,
  getTaxRateById,
  listTaxRates,
  createTaxRule,
  getTaxRuleById,
  listTaxRules,
  deactivateTaxRule,
  createTaxAccountMapping,
  getTaxAccountMappingById,
  listTaxAccountMappings
} from "../../domain/tax/taxConfigService";
import { getTaxLinesForEntity } from "../../domain/tax/taxService";



// ── Zod schemas ──────────────────────────────────────────────────────────────

const createAccountSchema = z.object({
  accountCode: z.string().min(1),
  accountName: z.string().min(1),
  accountType: z.enum(ACCOUNT_TYPES),
  parentAccountId: z.string().min(1).optional()
});

const createSegmentDefinitionSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  sortOrder: z.number().int().min(1),
  isRequired: z.boolean().optional()
});

const setAccountSegmentsSchema = z.object({
  values: z.array(
    z.object({
      segmentDefinitionId: z.string().min(1),
      value: z.string().min(1)
    })
  )
});

const createFiscalYearSchema = z.object({
  yearLabel: z.string().min(1),
  startDate: z.string().min(1),
  endDate: z.string().min(1)
});

const createFiscalPeriodSchema = z.object({
  fiscalYearId: z.string().min(1),
  periodNumber: z.number().int().positive(),
  startDate: z.string().min(1),
  endDate: z.string().min(1)
});

const createJournalSchema = z.object({
  fiscalPeriodId: z.string().min(1),
  ledgerId: z.string().min(1).optional(),
  description: z.string().optional()
});

const addJournalLineSchema = z.object({
  accountId: z.string().min(1),
  debitAmount: z.number().nonnegative(),
  creditAmount: z.number().nonnegative(),
  memo: z.string().optional()
});

const createLedgerSchema = z.object({
  name: z.string().min(1),
  currencyCode: z.string().min(3).max(3),
  calendar: z.string().optional(),
  chartOfAccountsRef: z.string().optional(),
  legalEntityId: z.string().min(1).optional()
});

const createLegalEntitySchema = z.object({
  name: z.string().min(1),
  currencyCode: z.string().min(3).max(3),
  locale: z.string().optional(),
  parentLegalEntityId: z.string().min(1).optional()
});

const createLedgerSetSchema = z.object({
  name: z.string().min(1)
});

const addLedgerSetMemberSchema = z.object({
  ledgerId: z.string().min(1)
});

const createCombinationRuleSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
  conditions: z
    .array(
      z.object({
        segmentDefinitionId: z.string().min(1),
        expectedValue: z.string().min(1)
      })
    )
    .min(1)
});

const validateCombinationSchema = z.object({
  values: z.array(
    z.object({
      segmentDefinitionId: z.string().min(1),
      value: z.string().min(1)
    })
  )
});

const createFxRateTypeSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional()
});

const createFxRateSchema = z.object({
  rateTypeId: z.string().min(1),
  fromCurrency: z.string().min(3).max(3),
  toCurrency: z.string().min(3).max(3),
  rate: z.number().positive(),
  validFrom: z.string().min(1),
  validTo: z.string().min(1).optional()
});

const createPostingProfileSchema = z.object({
  name: z.string().min(1),
  eventType: z.string().min(1),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
  lines: z
    .array(
      z.object({
        entrySide: z.enum(["debit", "credit"]),
        accountId: z.string().min(1),
        amountSource: z.string().min(1),
        memoTemplate: z.string().optional(),
        taxCode: z.string().min(1).optional(),
        taxApplicability: z
          .enum(["taxable", "exempt", "zero-rated", "reverse-charge", "withholding"])
          .optional(),
        taxAccountRole: z.string().min(1).optional()
      })
    )
    .min(1)
});

// ── HATEOAS link builders ────────────────────────────────────────────────────
const createTaxRegimeSchema = z.object({
  code:        z.string().min(1),
  name:        z.string().min(1),
  description: z.string().optional(),
  isActive:    z.boolean().optional()
});

const createTaxJurisdictionSchema = z.object({
  taxRegimeId:  z.string().min(1),
  countryCode:  z.string().length(2),
  regionCode:   z.string().optional(),
  cityCode:     z.string().optional(),
  name:         z.string().min(1)
});

const createTaxCodeSchema = z.object({
  taxRegimeId:      z.string().min(1),
  code:             z.string().min(1),
  description:      z.string().optional(),
  taxApplicability: z.enum(["taxable", "exempt", "zero-rated", "reverse-charge", "withholding"])
});

const createTaxRateSchema = z.object({
  taxCodeId:         z.string().min(1),
  taxJurisdictionId: z.string().min(1),
  ratePercent:       z.number().min(0),
  inclusiveFlag:     z.boolean().optional(),
  effectiveFrom:     z.string().min(1),
  effectiveTo:       z.string().optional()
});

const createTaxRuleSchema = z.object({
  taxRegimeId:    z.string().min(1),
  code:           z.string().min(1),
  name:           z.string().min(1),
  description:    z.string().optional(),
  priority:       z.number().int().min(0),
  taxCodeId:      z.string().min(1),
  conditionsJson: z.object({
    conditions: z.array(z.object({ field: z.string(), op: z.string(), value: z.string() })),
    match: z.enum(["all", "any"]).optional()
  }),
  effectiveFrom:  z.string().min(1),
  effectiveTo:    z.string().optional()
});

const createTaxAccountMappingSchema = z.object({
  taxRegimeId:     z.string().min(1),
  legalEntityId:   z.string().optional(),
  taxCodeId:       z.string().min(1),
  transactionType: z.string().min(1),
  accountRole:     z.enum(["tax_liability", "tax_recoverable", "withholding_payable"]),
  accountId:       z.string().min(1),
  effectiveFrom:   z.string().min(1),
  effectiveTo:     z.string().optional()
});

// ── HATEOAS link builders ────────────────────────────────────────────────────

function journalLinks(journalId: string, state: string) {
  const links: Record<string, { href: string; method: "GET" | "POST"; mcpFunction?: string; governance?: any }> = {
    self: { href: `/api/v1/r2r/journals/${journalId}`, method: "GET" },
    "add-line": {
      href: `/api/v1/r2r/journals/${journalId}/lines`,
      method: "POST",
      mcpFunction: "r2r_add_journal_line",
      governance: { riskLevel: "Medium", requiredTier: 2 }
    }
  };

  if (state === "Draft") {
    links["post"] = {
      href: `/api/v1/r2r/journals/${journalId}/post`,
      method: "POST",
      mcpFunction: "r2r_post_journal",
      governance: { riskLevel: "High", requiredTier: 3 }
    };
    links["cancel"] = {
      href: `/api/v1/r2r/journals/${journalId}/cancel`,
      method: "POST",
      mcpFunction: "r2r_cancel_journal",
      governance: { riskLevel: "High", requiredTier: 3 }
    };
  }

  if (state === "Posted") {
    links["reverse"] = {
      href: `/api/v1/r2r/journals/${journalId}/reverse`,
      method: "POST",
      mcpFunction: "r2r_reverse_journal",
      governance: { riskLevel: "High", requiredTier: 4 }
    };
  }

  return links;
}

function fiscalYearLinks(fiscalYearId: string, state: string) {
  const links: Record<string, { href: string; method: "GET" | "POST"; mcpFunction?: string; governance?: any }> = {
    self: { href: `/api/v1/r2r/fiscal-years/${fiscalYearId}`, method: "GET" }
  };

  if (state === "Open") {
    links["start-close"] = {
      href: `/api/v1/r2r/fiscal-years/${fiscalYearId}/start-close`,
      method: "POST",
      mcpFunction: "r2r_start_year_close",
      governance: { riskLevel: "High", requiredTier: 3 }
    };
    links["close"] = {
      href: `/api/v1/r2r/fiscal-years/${fiscalYearId}/close`,
      method: "POST",
      mcpFunction: "r2r_close_fiscal_year",
      governance: { riskLevel: "High", requiredTier: 4 }
    };
  }

  if (state === "Closing") {
    links["close"] = {
      href: `/api/v1/r2r/fiscal-years/${fiscalYearId}/close`,
      method: "POST",
      mcpFunction: "r2r_close_fiscal_year",
      governance: { riskLevel: "High", requiredTier: 4 }
    };
  }

  return links;
}

function fiscalPeriodLinks(fiscalPeriodId: string, state: string) {
  const links: Record<string, { href: string; method: "GET" | "POST"; mcpFunction?: string; governance?: any }> = {
    self: { href: `/api/v1/r2r/fiscal-periods/${fiscalPeriodId}`, method: "GET" }
  };

  if (state === "Open") {
    links["start-close"] = {
      href: `/api/v1/r2r/fiscal-periods/${fiscalPeriodId}/start-close`,
      method: "POST",
      mcpFunction: "r2r_start_period_close",
      governance: { riskLevel: "High", requiredTier: 3 }
    };
    links["close"] = {
      href: `/api/v1/r2r/fiscal-periods/${fiscalPeriodId}/close`,
      method: "POST",
      mcpFunction: "r2r_close_fiscal_period",
      governance: { riskLevel: "High", requiredTier: 3 }
    };
  }

  if (state === "Closing") {
    links["close"] = {
      href: `/api/v1/r2r/fiscal-periods/${fiscalPeriodId}/close`,
      method: "POST",
      mcpFunction: "r2r_close_fiscal_period",
      governance: { riskLevel: "High", requiredTier: 3 }
    };
  }

  if (state === "Closed") {
    links["lock"] = {
      href: `/api/v1/r2r/fiscal-periods/${fiscalPeriodId}/lock`,
      method: "POST",
      mcpFunction: "r2r_lock_fiscal_period",
      governance: { riskLevel: "High", requiredTier: 4 }
    };
  }

  return links;
}

// ── Router ───────────────────────────────────────────────────────────────────

export const r2rRouter = Router();

// -- Legal Entities --

r2rRouter.get("/legal-entities", (_req, res) => {
  const legalEntities = listLegalEntities().map((row: any) =>
    entityWithLinks(row, { self: { href: `/api/v1/r2r/legal-entities/${row.legal_entity_id}`, method: "GET" } })
  );

  res.json({ data: legalEntities });
});

r2rRouter.get("/legal-entities/:legalEntityId", (req, res) => {
  const legalEntity = getLegalEntityById(req.params.legalEntityId);
  res.json(
    entityWithLinks(legalEntity as any, {
      self: { href: `/api/v1/r2r/legal-entities/${req.params.legalEntityId}`, method: "GET" }
    })
  );
});

r2rRouter.post("/legal-entities", validateBody(createLegalEntitySchema), (req, res) => {
  const legalEntity = createLegalEntity(req.body, req.actor);
  res.status(201).json(
    entityWithLinks(legalEntity as any, {
      self: { href: `/api/v1/r2r/legal-entities/${(legalEntity as any).legal_entity_id}`, method: "GET" }
    })
  );
});

// -- Ledger Sets --

r2rRouter.get("/ledger-sets", (_req, res) => {
  const ledgerSets = listLedgerSets().map((row: any) =>
    entityWithLinks(row, {
      self: { href: `/api/v1/r2r/ledger-sets/${row.ledger_set_id}`, method: "GET" },
      members: { href: `/api/v1/r2r/ledger-sets/${row.ledger_set_id}/members`, method: "GET" }
    })
  );

  res.json({ data: ledgerSets });
});

r2rRouter.get("/ledger-sets/:ledgerSetId", (req, res) => {
  const ledgerSet = getLedgerSetById(req.params.ledgerSetId);
  res.json(
    entityWithLinks(ledgerSet as any, {
      self: { href: `/api/v1/r2r/ledger-sets/${req.params.ledgerSetId}`, method: "GET" },
      members: { href: `/api/v1/r2r/ledger-sets/${req.params.ledgerSetId}/members`, method: "GET" }
    })
  );
});

r2rRouter.post("/ledger-sets", validateBody(createLedgerSetSchema), (req, res) => {
  const ledgerSet = createLedgerSet(req.body, req.actor);
  res.status(201).json(
    entityWithLinks(ledgerSet as any, {
      self: { href: `/api/v1/r2r/ledger-sets/${(ledgerSet as any).ledger_set_id}`, method: "GET" },
      members: { href: `/api/v1/r2r/ledger-sets/${(ledgerSet as any).ledger_set_id}/members`, method: "GET" }
    })
  );
});

r2rRouter.get("/ledger-sets/:ledgerSetId/members", (req, res) => {
  const members = listLedgerSetMembers(req.params.ledgerSetId).map((row: any) =>
    entityWithLinks(row, { self: { href: `/api/v1/r2r/ledgers/${row.ledger_id}`, method: "GET" } })
  );

  res.json({ data: members });
});

r2rRouter.post("/ledger-sets/:ledgerSetId/members", validateBody(addLedgerSetMemberSchema), (req, res) => {
  const result = addLedgerToSet(
    {
      ledgerSetId: req.params.ledgerSetId,
      ledgerId: req.body.ledgerId
    },
    req.actor
  );

  res.status(201).json(result);
});

// -- Ledgers --

r2rRouter.get("/ledgers", (_req, res) => {
  const ledgers = listLedgers().map((row: any) =>
    entityWithLinks(row, { self: { href: `/api/v1/r2r/ledgers/${row.ledger_id}`, method: "GET" } })
  );
  res.json({ data: ledgers });
});

r2rRouter.get("/ledgers/:ledgerId", (req, res) => {
  const ledger = getLedgerById(req.params.ledgerId);
  res.json(entityWithLinks(ledger as any, { self: { href: `/api/v1/r2r/ledgers/${req.params.ledgerId}`, method: "GET" } }));
});

r2rRouter.post("/ledgers", validateBody(createLedgerSchema), (req, res) => {
  const ledger = createLedger(req.body, req.actor);
  res.status(201).json(entityWithLinks(ledger as any, { self: { href: `/api/v1/r2r/ledgers/${(ledger as any).ledger_id}`, method: "GET" } }));
});

// -- FX --

r2rRouter.get("/fx/rate-types", (_req, res) => {
  const rows = listFxRateTypes().map((row: any) =>
    entityWithLinks(row, {
      self: { href: `/api/v1/r2r/fx/rate-types/${row.rate_type_id}`, method: "GET" }
    })
  );
  res.json({ data: rows });
});

r2rRouter.get("/fx/rate-types/:rateTypeId", (req, res) => {
  const row = getFxRateTypeById(req.params.rateTypeId);
  res.json(
    entityWithLinks(row as any, {
      self: { href: `/api/v1/r2r/fx/rate-types/${req.params.rateTypeId}`, method: "GET" }
    })
  );
});

r2rRouter.post("/fx/rate-types", validateBody(createFxRateTypeSchema), (req, res) => {
  const row = createFxRateType(req.body);
  res.status(201).json(
    entityWithLinks(row as any, {
      self: { href: `/api/v1/r2r/fx/rate-types/${(row as any).rate_type_id}`, method: "GET" }
    })
  );
});

r2rRouter.get("/fx/rates", (req, res) => {
  const rateTypeId = typeof req.query.rateTypeId === "string" ? req.query.rateTypeId : undefined;
  const rows = listFxRates(rateTypeId).map((row: any) =>
    entityWithLinks(row, {
      self: { href: `/api/v1/r2r/fx/rates/${row.rate_id}`, method: "GET" }
    })
  );
  res.json({ data: rows });
});

r2rRouter.post("/fx/rates", validateBody(createFxRateSchema), (req, res) => {
  const row = createFxRate(req.body);
  res.status(201).json(
    entityWithLinks(row as any, {
      self: { href: `/api/v1/r2r/fx/rates/${(row as any).rate_id}`, method: "GET" }
    })
  );
});

r2rRouter.get("/fx/rates/latest", (req, res) => {
  const rateTypeId = typeof req.query.rateTypeId === "string" ? req.query.rateTypeId : undefined;
  const fromCurrency = typeof req.query.fromCurrency === "string" ? req.query.fromCurrency : undefined;
  const toCurrency = typeof req.query.toCurrency === "string" ? req.query.toCurrency : undefined;
  const asOf = typeof req.query.asOf === "string" ? req.query.asOf : undefined;

  if (!rateTypeId || !fromCurrency || !toCurrency) {
    throw new HttpError(400, "invalid_request", "rateTypeId, fromCurrency, and toCurrency query params are required");
  }

  const row = getLatestFxRate({ rateTypeId, fromCurrency, toCurrency, asOf });
  res.json(row);
});

r2rRouter.get("/fx/rates/:rateId", (req, res) => {
  const row = getFxRateById(req.params.rateId);
  res.json(
    entityWithLinks(row as any, {
      self: { href: `/api/v1/r2r/fx/rates/${req.params.rateId}`, method: "GET" }
    })
  );
});

// -- SLA Posting Profiles --

r2rRouter.get("/sla/posting-profiles", (_req, res) => {
  const rows = listPostingProfiles().map((row: any) =>
    entityWithLinks(row, {
      self: { href: `/api/v1/r2r/sla/posting-profiles/${row.posting_profile_id}`, method: "GET" }
    })
  );
  res.json({ data: rows });
});

r2rRouter.get("/sla/posting-profiles/:postingProfileId", (req, res) => {
  const row = getPostingProfileById(req.params.postingProfileId);
  res.json(
    entityWithLinks(row as any, {
      self: { href: `/api/v1/r2r/sla/posting-profiles/${req.params.postingProfileId}`, method: "GET" }
    })
  );
});

r2rRouter.post("/sla/posting-profiles", validateBody(createPostingProfileSchema), (req, res) => {
  const row = createPostingProfile(req.body);
  res.status(201).json(
    entityWithLinks(row as any, {
      self: { href: `/api/v1/r2r/sla/posting-profiles/${(row as any).posting_profile_id}`, method: "GET" }
    })
  );
});

r2rRouter.post("/sla/posting-profiles/:postingProfileId/activate", (req, res) => {
  const row = setPostingProfileActiveState(req.params.postingProfileId, true);
  res.json(
    entityWithLinks(row as any, {
      self: { href: `/api/v1/r2r/sla/posting-profiles/${req.params.postingProfileId}`, method: "GET" }
    })
  );
});

r2rRouter.post("/sla/posting-profiles/:postingProfileId/deactivate", (req, res) => {
  const row = setPostingProfileActiveState(req.params.postingProfileId, false);
  res.json(
    entityWithLinks(row as any, {
      self: { href: `/api/v1/r2r/sla/posting-profiles/${req.params.postingProfileId}`, method: "GET" }
    })
  );
});

// -- Accounts --

r2rRouter.get("/accounts", (_req, res) => {
  const accounts = listAccounts().map((row: any) =>
    entityWithLinks(row, { self: { href: `/api/v1/r2r/accounts/${row.account_id}`, method: "GET" } })
  );
  res.json({ data: accounts });
});

r2rRouter.get("/accounts/hierarchy", (_req, res) => {
  const tree = listAccountHierarchy();
  res.json({ data: tree });
});

r2rRouter.get("/accounts/segment-definitions", (_req, res) => {
  const definitions = listSegmentDefinitions().map((row: any) =>
    entityWithLinks(row, {
      self: {
        href: `/api/v1/r2r/accounts/segment-definitions/${row.segment_definition_id}`,
        method: "GET"
      }
    })
  );

  res.json({ data: definitions });
});

r2rRouter.post("/accounts/segment-definitions", validateBody(createSegmentDefinitionSchema), (req, res) => {
  const definition = createSegmentDefinition(req.body);
  res.status(201).json(
    entityWithLinks(definition as any, {
      self: {
        href: `/api/v1/r2r/accounts/segment-definitions/${(definition as any).segment_definition_id}`,
        method: "GET"
      }
    })
  );
});

r2rRouter.get("/accounts/segment-definitions/:segmentDefinitionId", (req, res) => {
  const definition = getSegmentDefinitionById(req.params.segmentDefinitionId);
  res.json(
    entityWithLinks(definition as any, {
      self: {
        href: `/api/v1/r2r/accounts/segment-definitions/${req.params.segmentDefinitionId}`,
        method: "GET"
      }
    })
  );
});

r2rRouter.get("/accounts/:accountId/segments", (req, res) => {
  const rows = listAccountSegments(req.params.accountId);
  res.json({ data: rows });
});

r2rRouter.put("/accounts/:accountId/segments", validateBody(setAccountSegmentsSchema), (req, res) => {
  const rows = setAccountSegments({
    accountId: req.params.accountId,
    values: req.body.values
  });

  res.json({ data: rows });
});

r2rRouter.get("/accounts/combination-rules", (_req, res) => {
  const rules = listCombinationRules().map((row: any) =>
    entityWithLinks(row, {
      self: { href: `/api/v1/r2r/accounts/combination-rules/${row.rule_id}`, method: "GET" }
    })
  );

  res.json({ data: rules });
});

r2rRouter.get("/accounts/combination-rules/:ruleId", (req, res) => {
  const rule = getCombinationRuleById(req.params.ruleId);
  res.json(
    entityWithLinks(rule as any, {
      self: { href: `/api/v1/r2r/accounts/combination-rules/${req.params.ruleId}`, method: "GET" }
    })
  );
});

r2rRouter.post("/accounts/combination-rules", validateBody(createCombinationRuleSchema), (req, res) => {
  const rule = createCombinationRule(req.body);
  res.status(201).json(
    entityWithLinks(rule as any, {
      self: { href: `/api/v1/r2r/accounts/combination-rules/${(rule as any).rule_id}`, method: "GET" }
    })
  );
});

r2rRouter.post("/accounts/combination-rules/validate", validateBody(validateCombinationSchema), (req, res) => {
  const result = validateCombination(req.body);
  res.json(result);
});

r2rRouter.get("/accounts/:accountId", (req, res) => {
  const account = getAccountById(req.params.accountId);
  res.json(entityWithLinks(account as any, { self: { href: `/api/v1/r2r/accounts/${req.params.accountId}`, method: "GET" } }));
});

r2rRouter.post("/accounts", validateBody(createAccountSchema), (req, res) => {
  const account = createAccount(req.body);
  res.status(201).json(entityWithLinks(account as any, { self: { href: `/api/v1/r2r/accounts/${(account as any).account_id}`, method: "GET" } }));
});

// -- Fiscal Years --

r2rRouter.get("/fiscal-years", (_req, res) => {
  const fiscalYears = listFiscalYears().map((row: any) =>
    entityWithLinks(row, fiscalYearLinks(row.fiscal_year_id, row.state))
  );
  res.json({ data: fiscalYears });
});

r2rRouter.get("/fiscal-years/:fiscalYearId", (req, res) => {
  const fiscalYear = getFiscalYearById(req.params.fiscalYearId);
  res.json(entityWithLinks(fiscalYear as any, fiscalYearLinks(req.params.fiscalYearId, (fiscalYear as any).state)));
});

r2rRouter.post("/fiscal-years", validateBody(createFiscalYearSchema), (req, res) => {
  const fiscalYear = createFiscalYear(req.body, req.actor);
  res.status(201).json(entityWithLinks(fiscalYear as any, fiscalYearLinks((fiscalYear as any).fiscal_year_id, (fiscalYear as any).state)));
});

r2rRouter.post("/fiscal-years/:fiscalYearId/start-close", (req, res) => {
  const fiscalYear = startYearClose(req.params.fiscalYearId, req.actor);
  res.json(entityWithLinks(fiscalYear as any, fiscalYearLinks(req.params.fiscalYearId, (fiscalYear as any).state)));
});

r2rRouter.post("/fiscal-years/:fiscalYearId/close", (req, res) => {
  const fiscalYear = closeFiscalYear(req.params.fiscalYearId, req.actor);
  res.json(entityWithLinks(fiscalYear as any, fiscalYearLinks(req.params.fiscalYearId, (fiscalYear as any).state)));
});

// -- Fiscal Periods --

r2rRouter.get("/fiscal-periods", (req, res) => {
  const fiscalYearId = typeof req.query.fiscalYearId === "string" ? req.query.fiscalYearId : undefined;
  const fiscalPeriods = listFiscalPeriods(fiscalYearId).map((row: any) =>
    entityWithLinks(row, fiscalPeriodLinks(row.fiscal_period_id, row.state))
  );
  res.json({ data: fiscalPeriods });
});

r2rRouter.get("/fiscal-periods/:fiscalPeriodId", (req, res) => {
  const fiscalPeriod = getFiscalPeriodById(req.params.fiscalPeriodId);
  res.json(entityWithLinks(fiscalPeriod as any, fiscalPeriodLinks(req.params.fiscalPeriodId, (fiscalPeriod as any).state)));
});

r2rRouter.post("/fiscal-periods", validateBody(createFiscalPeriodSchema), (req, res) => {
  const fiscalPeriod = createFiscalPeriod(req.body, req.actor);
  res
    .status(201)
    .json(entityWithLinks(fiscalPeriod as any, fiscalPeriodLinks((fiscalPeriod as any).fiscal_period_id, (fiscalPeriod as any).state)));
});

r2rRouter.post("/fiscal-periods/:fiscalPeriodId/start-close", (req, res) => {
  const fiscalPeriod = startPeriodClose(req.params.fiscalPeriodId, req.actor);
  res.json(entityWithLinks(fiscalPeriod as any, fiscalPeriodLinks(req.params.fiscalPeriodId, (fiscalPeriod as any).state)));
});

r2rRouter.post("/fiscal-periods/:fiscalPeriodId/close", (req, res) => {
  const fiscalPeriod = closePeriod(req.params.fiscalPeriodId, req.actor);
  res.json(entityWithLinks(fiscalPeriod as any, fiscalPeriodLinks(req.params.fiscalPeriodId, (fiscalPeriod as any).state)));
});

r2rRouter.post("/fiscal-periods/:fiscalPeriodId/lock", (req, res) => {
  const fiscalPeriod = lockPeriod(req.params.fiscalPeriodId, req.actor);
  res.json(entityWithLinks(fiscalPeriod as any, fiscalPeriodLinks(req.params.fiscalPeriodId, (fiscalPeriod as any).state)));
});

// -- Journals --

r2rRouter.get("/journals", (_req, res) => {
  const journals = listJournals().map((row: any) => entityWithLinks(row, journalLinks(row.journal_id, row.state)));
  res.json({ data: journals });
});

r2rRouter.get("/journals/:journalId", (req, res) => {
  const journal = getJournalById(req.params.journalId);
  res.json(entityWithLinks(journal as any, journalLinks(req.params.journalId, (journal as any).state)));
});

r2rRouter.post("/journals", validateBody(createJournalSchema), (req, res) => {
  const journal = createJournal(req.body);
  res.status(201).json(entityWithLinks(journal as any, journalLinks((journal as any).journal_id, (journal as any).state)));
});

r2rRouter.post("/journals/:journalId/lines", validateBody(addJournalLineSchema), (req, res) => {
  const result = addJournalLine({
    journalId: req.params.journalId,
    accountId: req.body.accountId,
    debitAmount: req.body.debitAmount,
    creditAmount: req.body.creditAmount,
    memo: req.body.memo
  });

  res.status(201).json(result);
});

r2rRouter.post("/journals/:journalId/post", (req, res) => {
  const journal = postJournal(req.params.journalId, req.actor);
  res.json(entityWithLinks(journal as any, journalLinks(req.params.journalId, (journal as any).state)));
});

r2rRouter.post("/journals/:journalId/reverse", (req, res) => {
  const journal = reverseJournal(req.params.journalId, req.actor);
  res.json(entityWithLinks(journal as any, journalLinks(req.params.journalId, (journal as any).state)));
});

r2rRouter.post("/journals/:journalId/cancel", (req, res) => {
  const journal = cancelJournal(req.params.journalId, req.actor);
  res.json(entityWithLinks(journal as any, journalLinks(req.params.journalId, (journal as any).state)));
});

r2rRouter.get("/trial-balance/:fiscalPeriodId", (req, res) => {
  const rows = getTrialBalance(req.params.fiscalPeriodId);

  // -- Tax Regimes --

  r2rRouter.get("/tax/regimes", (_req, res) => {
    const rows = listTaxRegimes().map((row: any) =>
      entityWithLinks(row, { self: { href: `/api/v1/r2r/tax/regimes/${row.tax_regime_id}`, method: "GET" } })
    );
    res.json({ data: rows });
  });

  r2rRouter.get("/tax/regimes/:taxRegimeId", (req, res) => {
    const row = getTaxRegimeById(req.params.taxRegimeId);
    res.json(entityWithLinks(row as any, { self: { href: `/api/v1/r2r/tax/regimes/${req.params.taxRegimeId}`, method: "GET" } }));
  });

  r2rRouter.post("/tax/regimes", validateBody(createTaxRegimeSchema), (req, res) => {
    const row = createTaxRegime(req.body);
    res.status(201).json(entityWithLinks(row as any, { self: { href: `/api/v1/r2r/tax/regimes/${(row as any).tax_regime_id}`, method: "GET" } }));
  });

  // -- Tax Jurisdictions --

  r2rRouter.get("/tax/jurisdictions", (_req, res) => {
    const rows = listTaxJurisdictions().map((row: any) =>
      entityWithLinks(row, { self: { href: `/api/v1/r2r/tax/jurisdictions/${row.tax_jurisdiction_id}`, method: "GET" } })
    );
    res.json({ data: rows });
  });

  r2rRouter.get("/tax/jurisdictions/:taxJurisdictionId", (req, res) => {
    const row = getTaxJurisdictionById(req.params.taxJurisdictionId);
    res.json(entityWithLinks(row as any, { self: { href: `/api/v1/r2r/tax/jurisdictions/${req.params.taxJurisdictionId}`, method: "GET" } }));
  });

  r2rRouter.post("/tax/jurisdictions", validateBody(createTaxJurisdictionSchema), (req, res) => {
    const row = createTaxJurisdiction(req.body);
    res.status(201).json(entityWithLinks(row as any, { self: { href: `/api/v1/r2r/tax/jurisdictions/${(row as any).tax_jurisdiction_id}`, method: "GET" } }));
  });

  // -- Tax Codes --

  r2rRouter.get("/tax/codes", (_req, res) => {
    const rows = listTaxCodes().map((row: any) =>
      entityWithLinks(row, { self: { href: `/api/v1/r2r/tax/codes/${row.tax_code_id}`, method: "GET" } })
    );
    res.json({ data: rows });
  });

  r2rRouter.get("/tax/codes/:taxCodeId", (req, res) => {
    const row = getTaxCodeById(req.params.taxCodeId);
    res.json(entityWithLinks(row as any, { self: { href: `/api/v1/r2r/tax/codes/${req.params.taxCodeId}`, method: "GET" } }));
  });

  r2rRouter.post("/tax/codes", validateBody(createTaxCodeSchema), (req, res) => {
    const row = createTaxCode(req.body);
    res.status(201).json(entityWithLinks(row as any, { self: { href: `/api/v1/r2r/tax/codes/${(row as any).tax_code_id}`, method: "GET" } }));
  });

  // -- Tax Rates --

  r2rRouter.get("/tax/rates", (_req, res) => {
    const rows = listTaxRates().map((row: any) =>
      entityWithLinks(row, { self: { href: `/api/v1/r2r/tax/rates/${row.tax_rate_id}`, method: "GET" } })
    );
    res.json({ data: rows });
  });

  r2rRouter.get("/tax/rates/:taxRateId", (req, res) => {
    const row = getTaxRateById(req.params.taxRateId);
    res.json(entityWithLinks(row as any, { self: { href: `/api/v1/r2r/tax/rates/${req.params.taxRateId}`, method: "GET" } }));
  });

  r2rRouter.post("/tax/rates", validateBody(createTaxRateSchema), (req, res) => {
    const row = createTaxRate(req.body);
    res.status(201).json(entityWithLinks(row as any, { self: { href: `/api/v1/r2r/tax/rates/${(row as any).tax_rate_id}`, method: "GET" } }));
  });

  // -- Tax Rules --

  r2rRouter.get("/tax/rules", (_req, res) => {
    const rows = listTaxRules().map((row: any) =>
      entityWithLinks(row, { self: { href: `/api/v1/r2r/tax/rules/${row.tax_rule_id}`, method: "GET" } })
    );
    res.json({ data: rows });
  });

  r2rRouter.get("/tax/rules/:taxRuleId", (req, res) => {
    const row = getTaxRuleById(req.params.taxRuleId);
    res.json(entityWithLinks(row as any, { self: { href: `/api/v1/r2r/tax/rules/${req.params.taxRuleId}`, method: "GET" } }));
  });

  r2rRouter.post("/tax/rules", validateBody(createTaxRuleSchema), (req, res) => {
    const row = createTaxRule(req.body);
    res.status(201).json(entityWithLinks(row as any, { self: { href: `/api/v1/r2r/tax/rules/${(row as any).tax_rule_id}`, method: "GET" } }));
  });

  r2rRouter.post("/tax/rules/:taxRuleId/deactivate", (req, res) => {
    const row = deactivateTaxRule(req.params.taxRuleId);
    res.json(entityWithLinks(row as any, { self: { href: `/api/v1/r2r/tax/rules/${req.params.taxRuleId}`, method: "GET" } }));
  });

  // -- Tax Account Mappings --

  r2rRouter.get("/tax/account-mappings", (_req, res) => {
    const rows = listTaxAccountMappings().map((row: any) =>
      entityWithLinks(row, { self: { href: `/api/v1/r2r/tax/account-mappings/${row.tax_account_mapping_id}`, method: "GET" } })
    );
    res.json({ data: rows });
  });

  r2rRouter.get("/tax/account-mappings/:taxAccountMappingId", (req, res) => {
    const row = getTaxAccountMappingById(req.params.taxAccountMappingId);
    res.json(entityWithLinks(row as any, { self: { href: `/api/v1/r2r/tax/account-mappings/${req.params.taxAccountMappingId}`, method: "GET" } }));
  });

  r2rRouter.post("/tax/account-mappings", validateBody(createTaxAccountMappingSchema), (req, res) => {
    const row = createTaxAccountMapping(req.body);
    res.status(201).json(entityWithLinks(row as any, { self: { href: `/api/v1/r2r/tax/account-mappings/${(row as any).tax_account_mapping_id}`, method: "GET" } }));
  });

  // -- Tax Transaction Lines (read-only) --

  r2rRouter.get("/tax/transaction-lines/:sourceEntityId", (req, res) => {
    const rows = getTaxLinesForEntity(req.params.sourceEntityId);
    res.json({ data: rows });
  });
  res.json({ data: rows });
});
