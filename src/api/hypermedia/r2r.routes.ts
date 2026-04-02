import { Router } from "express";
import { z } from "zod";
import { validateBody } from "../../middleware/validate";
import { entityWithLinks } from "../../utils/hypermedia";
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
import { ACCOUNT_TYPES, createAccount, getAccountById, listAccounts } from "../../domain/r2r/account/accountService";
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

// ── Zod schemas ──────────────────────────────────────────────────────────────

const createAccountSchema = z.object({
  accountCode: z.string().min(1),
  accountName: z.string().min(1),
  accountType: z.enum(ACCOUNT_TYPES)
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
  chartOfAccountsRef: z.string().optional()
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

// -- Accounts --

r2rRouter.get("/accounts", (_req, res) => {
  const accounts = listAccounts().map((row: any) =>
    entityWithLinks(row, { self: { href: `/api/v1/r2r/accounts/${row.account_id}`, method: "GET" } })
  );
  res.json({ data: accounts });
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
  res.json({ data: rows });
});
