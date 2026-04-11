-- Backfill journal.ledger_id for historical rows where it is missing and
-- all journal lines point to accounts in a single ledger.
UPDATE r2r_journal
SET ledger_id = (
  SELECT MIN(a.ledger_id)
  FROM r2r_journal_line jl
  JOIN r2r_account a ON a.account_id = jl.account_id
  WHERE jl.journal_id = r2r_journal.journal_id
)
WHERE ledger_id IS NULL
  AND journal_id IN (
    SELECT jl.journal_id
    FROM r2r_journal_line jl
    JOIN r2r_account a ON a.account_id = jl.account_id
    GROUP BY jl.journal_id
    HAVING COUNT(DISTINCT a.ledger_id) = 1
       AND MIN(a.ledger_id) IS NOT NULL
  );
