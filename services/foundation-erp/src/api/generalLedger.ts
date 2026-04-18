import { Router, Request, Response } from "express";
import {
  createJournal,
  postJournal,
  getJournalById,
  listJournals,
  getTrialBalance,
} from "../domain/r2r/journal/journalService";
import { listAccounts } from "../domain/r2r/account/accountService";
import { db } from "../db/connection";

const router = Router();

/**
 * POST /api/v1/general-ledger/journal-entries
 * Create a new journal entry in Draft status
 */
router.post("/journal-entries", (req: Request, res: Response) => {
  try {
    const actor = req.actor;
    const {
      fiscalPeriodId,
      ledgerId,
      description,
    } = req.body;

    if (!fiscalPeriodId) {
      return res.status(400).json({ success: false, error: "fiscalPeriodId is required" });
    }

    const entry = createJournal(
      {
        fiscalPeriodId,
        ledgerId,
        description,
      },
    );

    res.status(201).json({
      success: true,
      data: entry,
      message: `Journal entry '${(entry as { journal_id?: string }).journal_id ?? ""}' created successfully`,
    });
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    const statusCode = error.message.includes("invalid") ? 400 : 500;
    res.status(statusCode).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v1/general-ledger/journal-entries/:entryId
 * Retrieve a journal entry by ID
 */
router.get("/journal-entries/:entryId", (req: Request, res: Response) => {
  try {
    const { entryId } = req.params;
    const entry = getJournalById(entryId);

    if (!entry) {
      return res.status(404).json({ success: false, error: "Journal entry not found" });
    }

    res.json({ success: true, data: entry });
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v1/general-ledger/journal-entries
 * List journal entries for an organization
 */
router.get("/journal-entries", (req: Request, res: Response) => {
  try {
    const entries = listJournals();

    res.json({
      success: true,
      data: entries,
      count: entries.length,
    });
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/v1/general-ledger/journal-entries/:entryId/post
 * Post a journal entry (moves to Posted status)
 */
router.post("/journal-entries/:entryId/post", (req: Request, res: Response) => {
  try {
    const { entryId } = req.params;
    const actor = req.actor;

    const entry = postJournal(entryId, actor);

    res.json({
      success: true,
      data: entry,
      message: `Journal entry '${entryId}' posted`,
    });
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    const statusCode = error.message.includes("invalid_state") ? 400 : 500;
    res.status(statusCode).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v1/general-ledger/chart-of-accounts
 * Get chart of accounts for an organization
 */
router.get("/chart-of-accounts", (req: Request, res: Response) => {
  try {
    const coa = listAccounts();

    res.json({
      success: true,
      data: coa,
    });
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v1/general-ledger/account-balance/:accountNumber
 * Get current balance for a specific account
 */
router.get("/account-balance/:accountId", (req: Request, res: Response) => {
  try {
    const { accountId } = req.params;
    const { asOfDate } = req.query;

    const row = db
      .prepare(
        `SELECT
           COALESCE(SUM(debit_amount), 0) AS debit_total,
           COALESCE(SUM(credit_amount), 0) AS credit_total
         FROM r2r_ledger_entry
         WHERE account_id = ?
           AND (? IS NULL OR posting_date <= ?)`
      )
      .get(accountId, asOfDate ?? null, asOfDate ?? null) as
      | { debit_total: number; credit_total: number }
      | undefined;

    const balance = (row?.debit_total ?? 0) - (row?.credit_total ?? 0);

    res.json({
      success: true,
      data: { accountId, balance, debitTotal: row?.debit_total ?? 0, creditTotal: row?.credit_total ?? 0 },
      accountId,
    });
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v1/general-ledger/trial-balance
 * Get trial balance for an organization as of a specific date
 */
router.get("/trial-balance", (req: Request, res: Response) => {
  try {
    const { fiscalPeriodId } = req.query;

    if (!fiscalPeriodId) {
      return res.status(400).json({ success: false, error: "fiscalPeriodId is required" });
    }

    const trialBalance = getTrialBalance(fiscalPeriodId as string);

    res.json({
      success: true,
      data: trialBalance,
      fiscalPeriodId,
    });
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
