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
  updateJournalState
} from "../../domain/r2r/journal/journalService";
import { createAccount, getAccountById, listAccounts } from "../../domain/r2r/account/accountService";
import {
  createFiscalPeriod,
  createFiscalYear,
  getFiscalPeriodById,
  getFiscalYearById,
  listFiscalPeriods,
  listFiscalYears,
  updateFiscalPeriodState,
  updateFiscalYearState
} from "../../domain/r2r/fiscal/fiscalService";

const createAccountSchema = z.object({
  accountCode: z.string().min(1),
  accountName: z.string().min(1),
  accountType: z.string().min(1)
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

function journalLinks(journalId: string, state: string) {
  const links: Record<string, { href: string; method: "GET" | "POST"; mcpFunction?: string }> = {
    self: { href: `/api/v1/r2r/journals/${journalId}`, method: "GET" },
    "add-line": {
      href: `/api/v1/r2r/journals/${journalId}/lines`,
      method: "POST",
      mcpFunction: "r2r_add_journal_line"
    }
  };

  if (state === "Draft") {
    links["post"] = {
      href: `/api/v1/r2r/journals/${journalId}/post`,
      method: "POST",
      mcpFunction: "r2r_post_journal"
    };
  }

  return links;
}

function fiscalYearLinks(fiscalYearId: string, state: string) {
  const links: Record<string, { href: string; method: "GET" | "POST"; mcpFunction?: string }> = {
    self: { href: `/api/v1/r2r/fiscal-years/${fiscalYearId}`, method: "GET" }
  };

  if (state === "Open") {
    links["close"] = {
      href: `/api/v1/r2r/fiscal-years/${fiscalYearId}/close`,
      method: "POST",
      mcpFunction: "r2r_close_fiscal_year"
    };
  }

  return links;
}

function fiscalPeriodLinks(fiscalPeriodId: string, state: string) {
  const links: Record<string, { href: string; method: "GET" | "POST"; mcpFunction?: string }> = {
    self: { href: `/api/v1/r2r/fiscal-periods/${fiscalPeriodId}`, method: "GET" }
  };

  if (state === "Open") {
    links["close"] = {
      href: `/api/v1/r2r/fiscal-periods/${fiscalPeriodId}/close`,
      method: "POST",
      mcpFunction: "r2r_close_fiscal_period"
    };
  }

  if (state === "Closed") {
    links["lock"] = {
      href: `/api/v1/r2r/fiscal-periods/${fiscalPeriodId}/lock`,
      method: "POST",
      mcpFunction: "r2r_lock_fiscal_period"
    };
  }

  return links;
}

export const r2rRouter = Router();

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
  const fiscalYear = createFiscalYear(req.body);
  res.status(201).json(entityWithLinks(fiscalYear as any, fiscalYearLinks((fiscalYear as any).fiscal_year_id, (fiscalYear as any).state)));
});

r2rRouter.post("/fiscal-years/:fiscalYearId/close", (req, res) => {
  const fiscalYear = updateFiscalYearState(req.params.fiscalYearId, "Closed");
  res.json(entityWithLinks(fiscalYear as any, fiscalYearLinks(req.params.fiscalYearId, (fiscalYear as any).state)));
});

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
  const fiscalPeriod = createFiscalPeriod(req.body);
  res
    .status(201)
    .json(entityWithLinks(fiscalPeriod as any, fiscalPeriodLinks((fiscalPeriod as any).fiscal_period_id, (fiscalPeriod as any).state)));
});

r2rRouter.post("/fiscal-periods/:fiscalPeriodId/close", (req, res) => {
  const fiscalPeriod = updateFiscalPeriodState(req.params.fiscalPeriodId, "Closed");
  res.json(entityWithLinks(fiscalPeriod as any, fiscalPeriodLinks(req.params.fiscalPeriodId, (fiscalPeriod as any).state)));
});

r2rRouter.post("/fiscal-periods/:fiscalPeriodId/lock", (req, res) => {
  const fiscalPeriod = updateFiscalPeriodState(req.params.fiscalPeriodId, "Locked");
  res.json(entityWithLinks(fiscalPeriod as any, fiscalPeriodLinks(req.params.fiscalPeriodId, (fiscalPeriod as any).state)));
});

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
  const journal = updateJournalState(req.params.journalId, "Posted");
  res.json(entityWithLinks(journal as any, journalLinks(req.params.journalId, (journal as any).state)));
});

r2rRouter.get("/trial-balance/:fiscalPeriodId", (req, res) => {
  const rows = getTrialBalance(req.params.fiscalPeriodId);
  res.json({ data: rows });
});
