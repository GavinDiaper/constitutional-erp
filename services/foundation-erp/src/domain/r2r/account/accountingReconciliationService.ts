import { db } from "../../../db/connection";
import { HttpError } from "../../../utils/errors";

const CONTROL_ACCOUNTS = [
  { key: "accountsReceivable", accountCode: "SYS-110-ASSET-AR", normalBalance: "debit" },
  { key: "accountsPayable", accountCode: "SYS-200-LIAB-AP", normalBalance: "credit" },
  { key: "unbilledReceivables", accountCode: "SYS-130-ASSET-UNBILLED-AR", normalBalance: "debit" }
] as const;

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function getAccountIds() {
  const rows = db.prepare(
    `SELECT account_id, account_code FROM r2r_account
     WHERE account_code IN (${CONTROL_ACCOUNTS.map(() => "?").join(",")})`
  ).all(...CONTROL_ACCOUNTS.map(({ accountCode }) => accountCode)) as Array<{ account_id: string; account_code: string }>;
  const ids = new Map(rows.map((row) => [row.account_code, row.account_id]));
  const missing = CONTROL_ACCOUNTS.find(({ accountCode }) => !ids.has(accountCode));
  if (missing) throw new HttpError(409, "missing_account", `Required reconciliation account '${missing.accountCode}' is not configured`);
  return ids;
}

function getSubledgerByCurrency(query: string, ledgerId: string, fallbackCurrency: string) {
  return db.prepare(query).all(fallbackCurrency, ledgerId, fallbackCurrency) as Array<{
    currency_code: string;
    balance: number;
    document_count: number;
  }>;
}

export function getArApReconciliation() {
  const accounts = getAccountIds();
  const ledgers = db.prepare(
    `SELECT l.ledger_id, l.name AS ledger_name, l.currency_code,
            l.legal_entity_id, le.name AS legal_entity_name
     FROM r2r_ledger l
     LEFT JOIN r2r_legal_entity le ON le.legal_entity_id = l.legal_entity_id
     ORDER BY le.name, l.name`
  ).all() as Array<{
    ledger_id: string;
    ledger_name: string;
    currency_code: string;
    legal_entity_id: string | null;
    legal_entity_name: string | null;
  }>;

  const receivablesQuery =
    `SELECT COALESCE(i.currency_code, so.currency_code, ?) AS currency_code,
            SUM(MAX(0, i.amount_due - i.amount_paid)) AS balance,
            COUNT(CASE WHEN i.amount_due > i.amount_paid THEN 1 END) AS document_count
     FROM o2c_invoice i
     JOIN r2r_journal j ON j.journal_id = i.accounting_journal_id
     JOIN o2c_sales_order so ON so.order_id = i.order_id
     WHERE j.ledger_id = ? AND i.state IN ('Posted', 'Paid', 'Reconciled')
    GROUP BY COALESCE(i.currency_code, so.currency_code, ?)
    HAVING SUM(MAX(0, i.amount_due - i.amount_paid)) > 0.005`;
  const payablesQuery =
    `SELECT COALESCE(si.currency_code, l.currency_code, ?) AS currency_code,
            SUM(MAX(0, si.amount_due - si.amount_paid)) AS balance,
            COUNT(CASE WHEN si.amount_due > si.amount_paid THEN 1 END) AS document_count
     FROM p2p_supplier_invoice si
     JOIN r2r_journal j ON j.journal_id = si.accounting_journal_id
     JOIN p2p_purchase_order po ON po.po_id = si.po_id
     LEFT JOIN r2r_ledger l ON l.ledger_id = j.ledger_id
     WHERE j.ledger_id = ? AND si.state IN ('Posted', 'Paid')
    GROUP BY COALESCE(si.currency_code, l.currency_code, ?)
    HAVING SUM(MAX(0, si.amount_due - si.amount_paid)) > 0.005`;
  const unbilledQuery =
    `SELECT currency_code, SUM(balance) AS balance, SUM(document_count) AS document_count
     FROM (
       SELECT COALESCE(so.currency_code, ?) AS currency_code,
              m.billing_amount AS balance, 1 AS document_count
       FROM proj_project_milestone m
       JOIN o2c_sales_order_line sol ON sol.order_line_id = m.order_line_id
       JOIN o2c_sales_order so ON so.order_id = sol.order_id
       JOIN r2r_journal rev ON rev.journal_id = m.revenue_journal_id
       WHERE rev.ledger_id = ? AND m.status IN ('Approved', 'Completed')
       UNION ALL
       SELECT COALESCE(so.currency_code, ?) AS currency_code,
              -i.order_amount AS balance, -1 AS document_count
       FROM o2c_invoice i
       JOIN o2c_sales_order so ON so.order_id = i.order_id
       JOIN r2r_journal posted ON posted.journal_id = i.accounting_journal_id
       WHERE posted.ledger_id = ? AND i.project_milestone_id IS NOT NULL AND i.state <> 'Cancelled'
     ) earned_less_billed
     GROUP BY currency_code`;

  return ledgers.map((ledger) => {
    const glBalances = db.prepare(
      `SELECT le.account_id,
              SUM(le.debit_amount - le.credit_amount) AS debit_balance
       FROM r2r_ledger_entry le
       JOIN r2r_journal j ON j.journal_id = le.journal_id
       WHERE j.ledger_id = ? AND le.account_id IN (?, ?, ?)
       GROUP BY le.account_id`
    ).all(
      ledger.ledger_id,
      accounts.get("SYS-110-ASSET-AR"),
      accounts.get("SYS-200-LIAB-AP"),
      accounts.get("SYS-130-ASSET-UNBILLED-AR")
    ) as Array<{ account_id: string; debit_balance: number }>;
    const debitBalanceByAccount = new Map(glBalances.map((row) => [row.account_id, Number(row.debit_balance ?? 0)]));
    const receivables = getSubledgerByCurrency(receivablesQuery, ledger.ledger_id, ledger.currency_code);
    const payables = getSubledgerByCurrency(payablesQuery, ledger.ledger_id, ledger.currency_code);
    const unbilledReceivables = db.prepare(unbilledQuery).all(
      ledger.currency_code,
      ledger.ledger_id,
      ledger.currency_code,
      ledger.ledger_id
    ) as Array<{ currency_code: string; balance: number; document_count: number }>;

    const reconcile = (accountCode: string, normalBalance: "debit" | "credit", subledger: Array<{ currency_code: string; balance: number; document_count: number }>) => {
      const controlAccountId = accounts.get(accountCode)!;
      const debitBalance = debitBalanceByAccount.get(controlAccountId) ?? 0;
      const glBalance = roundMoney(normalBalance === "debit" ? debitBalance : -debitBalance);
      const currencies = subledger
        .map((row) => ({ currencyCode: row.currency_code, balance: roundMoney(Number(row.balance ?? 0)), documentCount: Number(row.document_count ?? 0) }))
        .filter((row) => row.documentCount > 0 || Math.abs(row.balance) > 0.005);
      const foreignCurrencyBalances = currencies.filter((row) => row.currencyCode !== ledger.currency_code);
      const ledgerCurrencyBalance = currencies
        .filter((row) => row.currencyCode === ledger.currency_code)
        .reduce((sum, row) => sum + row.balance, 0);
      const comparable = foreignCurrencyBalances.length === 0;
      return {
        accountCode,
        glBalance,
        ledgerCurrency: ledger.currency_code,
        subledgerByCurrency: currencies,
        comparable,
        difference: comparable ? roundMoney(glBalance - ledgerCurrencyBalance) : null,
        foreignCurrencyDocumentCount: foreignCurrencyBalances.reduce((sum, row) => sum + row.documentCount, 0)
      };
    };

    return {
      ledgerId: ledger.ledger_id,
      ledgerName: ledger.ledger_name,
      legalEntityId: ledger.legal_entity_id,
      legalEntityName: ledger.legal_entity_name,
      currencyCode: ledger.currency_code,
      accountsReceivable: reconcile("SYS-110-ASSET-AR", "debit", receivables),
      accountsPayable: reconcile("SYS-200-LIAB-AP", "credit", payables),
      unbilledReceivables: reconcile("SYS-130-ASSET-UNBILLED-AR", "debit", unbilledReceivables)
    };
  });
}
