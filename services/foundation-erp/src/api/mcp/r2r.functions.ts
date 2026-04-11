import { McpFunctionDef } from "./catalog";

export const r2rFunctions: McpFunctionDef[] = [
  { name: "r2r_create_ledger", domain: "r2r", description: "Create a general ledger" },
  { name: "r2r_create_account", domain: "r2r", description: "Create account" },
  { name: "r2r_create_fiscal_year", domain: "r2r", description: "Create fiscal year" },
  { name: "r2r_start_year_close", domain: "r2r", description: "Start fiscal year close" },
  { name: "r2r_close_fiscal_year", domain: "r2r", description: "Close fiscal year" },
  { name: "r2r_create_fiscal_period", domain: "r2r", description: "Create fiscal period" },
  { name: "r2r_start_period_close", domain: "r2r", description: "Start fiscal period close" },
  { name: "r2r_close_fiscal_period", domain: "r2r", description: "Close fiscal period" },
  { name: "r2r_lock_fiscal_period", domain: "r2r", description: "Lock fiscal period" },
  { name: "r2r_create_manual_journal", domain: "r2r", description: "Create manual journal" },
  { name: "r2r_add_journal_line", domain: "r2r", description: "Add journal line" },
  { name: "r2r_post_journal", domain: "r2r", description: "Post journal" },
  { name: "r2r_reverse_journal", domain: "r2r", description: "Reverse a posted journal" },
  { name: "r2r_cancel_journal", domain: "r2r", description: "Cancel a draft journal" },
  { name: "r2r_get_trial_balance", domain: "r2r", description: "Get trial balance" }
];
