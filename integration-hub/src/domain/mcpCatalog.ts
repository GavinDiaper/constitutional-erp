import { HttpError } from "../utils/errors";
import { McpFunction, OperationType } from "./types";

function tierFromRiskLevel(riskLevel?: "Low" | "Medium" | "High"): number | undefined {
  if (riskLevel === "Low") {
    return 1;
  }

  if (riskLevel === "Medium") {
    return 2;
  }

  if (riskLevel === "High") {
    return 3;
  }

  return undefined;
}

function normalizeKey(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

function matchesAction(
  action: string,
  candidateAction: string,
  actionAliases?: readonly string[]
): boolean {
  const normalizedAction = normalizeKey(action);
  const normalizedCandidate = normalizeKey(candidateAction);

  if (normalizedAction === normalizedCandidate) {
    return true;
  }

  return (actionAliases ?? []).some((alias) => normalizeKey(alias) === normalizedAction);
}

const FUNCTION_DEFS = [
  { id: "p2p_create_requisition", entity: "Requisition", domain: "p2p", aggregateType: "requisition", action: "create_requisition", operationType: "create", description: "Create requisition in Draft state", riskLevel: "Low", governanceTag: "P2P.Requisition.Create" },
  {
    id: "p2p_add_requisition_line",
    entity: "Requisition",
    domain: "p2p",
    aggregateType: "requisition",
    action: "lines",
    actionAliases: ["add-line"],
    operationType: "update",
    description: "Add a line to a draft requisition",
    riskLevel: "Low",
    governanceTag: "P2P.Requisition.UpdateLine",
    inputSchema: {
      type: "object",
      required: ["description", "quantity", "unitPrice"],
      properties: {
        description: { type: "string", minLength: 1 },
        quantity: { type: "number", minimum: 0.000001 },
        unitPrice: { type: "number", minimum: 0 }
      }
    }
  },
  { id: "p2p_submit_requisition", entity: "Requisition", domain: "p2p", aggregateType: "requisition", action: "submit", operationType: "transition", description: "Transition requisition to Submitted", riskLevel: "Low", governanceTag: "P2P.Requisition.Submit" },
  { id: "p2p_approve_requisition", entity: "Requisition", domain: "p2p", aggregateType: "requisition", action: "approve", operationType: "transition", description: "Transition requisition to Approved", riskLevel: "Medium", governanceTag: "P2P.Requisition.Approve" },
  { id: "p2p_convert_requisition_to_po", entity: "Requisition", domain: "p2p", aggregateType: "requisition", action: "convert-to-po", operationType: "transition", description: "Convert approved requisition to a Purchase Order", riskLevel: "Medium", governanceTag: "P2P.Requisition.Convert", inputSchema: { type: "object", required: ["supplierId"], properties: { supplierId: { type: "string", description: "Supplier to raise the PO against", "x-lookup": "p2p/suppliers" } } } },
  { id: "p2p_create_supplier", entity: "Supplier", domain: "p2p", aggregateType: "supplier", action: "create_supplier", operationType: "create", description: "Create supplier", riskLevel: "Low", governanceTag: "P2P.Supplier.Create" },
  { id: "p2p_activate_supplier", entity: "Supplier", domain: "p2p", aggregateType: "supplier", action: "activate", operationType: "transition", description: "Activate supplier", riskLevel: "Medium", governanceTag: "P2P.Supplier.Activate" },
  { id: "p2p_suspend_supplier", entity: "Supplier", domain: "p2p", aggregateType: "supplier", action: "suspend", operationType: "transition", description: "Suspend supplier", riskLevel: "Medium", governanceTag: "P2P.Supplier.Suspend" },
  { id: "p2p_reactivate_supplier", entity: "Supplier", domain: "p2p", aggregateType: "supplier", action: "reactivate", operationType: "transition", description: "Reactivate suspended supplier", riskLevel: "Medium", governanceTag: "P2P.Supplier.Reactivate" },
  { id: "p2p_deactivate_supplier", entity: "Supplier", domain: "p2p", aggregateType: "supplier", action: "deactivate", operationType: "transition", description: "Deactivate supplier", riskLevel: "High", governanceTag: "P2P.Supplier.Deactivate" },
  { id: "p2p_create_po", entity: "PurchaseOrder", domain: "p2p", aggregateType: "purchase-order", action: "create_po", operationType: "create", description: "Create purchase order", riskLevel: "Medium", governanceTag: "P2P.PO.Create" },
  {
    id: "p2p_add_po_line",
    entity: "PurchaseOrder",
    domain: "p2p",
    aggregateType: "purchase-order",
    action: "lines",
    actionAliases: ["add-line"],
    operationType: "update",
    description: "Add a line to a draft purchase order",
    riskLevel: "Low",
    governanceTag: "P2P.PO.UpdateLine",
    inputSchema: {
      type: "object",
      required: ["description", "quantity", "unitPrice"],
      properties: {
        description: { type: "string", minLength: 1 },
        quantity: { type: "number", minimum: 0.000001 },
        unitPrice: { type: "number", minimum: 0 }
      }
    }
  },
  {
    id: "p2p_issue_po",
    entity: "PurchaseOrder",
    domain: "p2p",
    aggregateType: "purchase-order",
    action: "approve",
    actionAliases: ["issue", "issue_po"],
    operationType: "transition",
    description: "Approve draft purchase order",
    riskLevel: "High",
    governanceTag: "P2P.PO.Approve"
  },
  { id: "p2p_acknowledge_po", entity: "PurchaseOrder", domain: "p2p", aggregateType: "purchase-order", action: "acknowledge_po", operationType: "transition", description: "Acknowledge purchase order", riskLevel: "Low", governanceTag: "P2P.PO.Acknowledge" },
  { id: "p2p_create_goods_receipt", entity: "GoodsReceipt", domain: "p2p", aggregateType: "goods-receipt", action: "create_goods_receipt", operationType: "create", description: "Create goods receipt", riskLevel: "Low", governanceTag: "P2P.GoodsReceipt.Create" },
  { id: "p2p_receive_goods", entity: "GoodsReceipt", domain: "p2p", aggregateType: "goods-receipt", action: "receive_goods", operationType: "transition", description: "Receive goods", riskLevel: "Low", governanceTag: "P2P.GoodsReceipt.Receive" },
  { id: "p2p_accept_goods", entity: "GoodsReceipt", domain: "p2p", aggregateType: "goods-receipt", action: "accept_goods", operationType: "transition", description: "Accept goods", riskLevel: "Medium", governanceTag: "P2P.GoodsReceipt.Accept" },
  { id: "p2p_create_supplier_invoice", entity: "SupplierInvoice", domain: "p2p", aggregateType: "supplier-invoice", action: "create_supplier_invoice", operationType: "create", description: "Create supplier invoice", riskLevel: "Low", governanceTag: "P2P.SupplierInvoice.Create" },
  { id: "p2p_post_supplier_invoice", entity: "SupplierInvoice", domain: "p2p", aggregateType: "supplier-invoice", action: "post_supplier_invoice", operationType: "transition", description: "Post supplier invoice", riskLevel: "Medium", governanceTag: "P2P.SupplierInvoice.Post" },
  { id: "p2p_create_ap_payment", entity: "ApPayment", domain: "p2p", aggregateType: "ap-payment", action: "create_ap_payment", operationType: "create", description: "Create AP payment", riskLevel: "Medium", governanceTag: "P2P.ApPayment.Create" },
  { id: "p2p_execute_ap_payment", entity: "ApPayment", domain: "p2p", aggregateType: "ap-payment", action: "execute_ap_payment", operationType: "transition", description: "Execute AP payment", riskLevel: "High", governanceTag: "P2P.ApPayment.Execute" },
  { id: "p2p_reconcile_ap_payment", entity: "ApPayment", domain: "p2p", aggregateType: "ap-payment", action: "reconcile_ap_payment", operationType: "transition", description: "Reconcile AP payment", riskLevel: "Low", governanceTag: "P2P.ApPayment.Reconcile" },

  { id: "o2c_create_quote", entity: "Quote", domain: "o2c", aggregateType: "quote", action: "create_quote", operationType: "create", description: "Create a sales quote", riskLevel: "Low", governanceTag: "O2C.Quote.Create" },
  {
    id: "o2c_add_quote_line",
    entity: "Quote",
    domain: "o2c",
    aggregateType: "quote",
    action: "lines",
    actionAliases: ["add_quote_line", "add-line"],
    operationType: "update",
    description: "Add a quote line",
    riskLevel: "Low",
    governanceTag: "O2C.Quote.Update",
    inputSchema: {
      type: "object",
      required: ["sku", "quantity", "unitPrice"],
      properties: {
        sku: { type: "string", description: "SKU / product code", minLength: 1 },
        quantity: { type: "number", description: "Quantity", minimum: 0.000001 },
        unitPrice: { type: "number", description: "Unit price", minimum: 0 },
        taxCodeId: {
          type: "string",
          description: "Tax code for this line (dynamically filtered by quote legal entity)",
          "x-lookup": "o2c/quotes/{entityId}/tax-options"
        },
        countryCode: { type: "string", description: "Country code for tax determination (defaults to AE)" }
      }
    }
  },
  { id: "o2c_send_quote", entity: "Quote", domain: "o2c", aggregateType: "quote", action: "send", operationType: "transition", description: "Send quote", riskLevel: "Low", governanceTag: "O2C.Quote.Send" },
  { id: "o2c_accept_quote", entity: "Quote", domain: "o2c", aggregateType: "quote", action: "accept", operationType: "transition", description: "Accept quote", riskLevel: "Low", governanceTag: "O2C.Quote.Accept" },
  { id: "o2c_convert_quote_to_order", entity: "Quote", domain: "o2c", aggregateType: "quote", action: "convert-to-order", operationType: "transition", description: "Convert quote to order", riskLevel: "Medium", governanceTag: "O2C.Quote.Convert" },
  { id: "o2c_confirm_order", entity: "SalesOrder", domain: "o2c", aggregateType: "sales-order", action: "confirm", operationType: "transition", description: "Confirm order", riskLevel: "Medium", governanceTag: "O2C.Order.Confirm" },
  { id: "o2c_allocate_stock", entity: "SalesOrder", domain: "o2c", aggregateType: "sales-order", action: "allocate", operationType: "transition", description: "Allocate stock", riskLevel: "Medium", governanceTag: "O2C.Order.Allocate" },
  { id: "o2c_ship_order", entity: "SalesOrder", domain: "o2c", aggregateType: "sales-order", action: "ship", operationType: "transition", description: "Ship order", riskLevel: "Medium", governanceTag: "O2C.Order.Ship" },
  {
    id: "o2c_generate_invoice_from_order",
    entity: "SalesOrder",
    domain: "o2c",
    aggregateType: "sales-order",
    action: "generate-invoice",
    actionAliases: ["generate_invoice", "invoice"],
    operationType: "transition",
    description: "Generate invoice from shipped order",
    riskLevel: "Medium",
    governanceTag: "O2C.Invoice.Generate",
    inputSchema: {
      type: "object",
      required: [],
      properties: {
        taxCodeId: { type: "string", description: "Optional header-level tax code fallback" },
        countryCode: { type: "string", description: "Country code for tax determination (defaults to AE)" }
      }
    }
  },
  { id: "o2c_generate_invoice", entity: "ArInvoice", domain: "o2c", aggregateType: "ar-invoice", action: "generate_invoice", operationType: "create", description: "Generate invoice", riskLevel: "Medium", governanceTag: "O2C.Invoice.Generate" },
  {
    id: "o2c_post_invoice",
    entity: "ArInvoice",
    domain: "o2c",
    aggregateType: "ar-invoice",
    action: "post",
    actionAliases: ["post_invoice", "post-ar-invoice", "post_ar_invoice"],
    operationType: "transition",
    description: "Post invoice",
    riskLevel: "Medium",
    governanceTag: "O2C.Invoice.Post"
  },
  { id: "o2c_register_payment", entity: "ArPayment", domain: "o2c", aggregateType: "ar-payment", action: "register_payment", operationType: "create", description: "Register payment", riskLevel: "Medium", governanceTag: "O2C.Payment.Register" },
  { id: "o2c_apply_payment_to_invoice", entity: "ArPayment", domain: "o2c", aggregateType: "ar-payment", action: "apply_payment_to_invoice", operationType: "transition", description: "Apply payment", riskLevel: "Low", governanceTag: "O2C.Payment.Apply" },

  { id: "r2r_create_account", entity: "Account", domain: "r2r", aggregateType: "account", action: "create_account", operationType: "create", description: "Create account", riskLevel: "Low", governanceTag: "R2R.Account.Create" },
  { id: "r2r_create_fiscal_year", entity: "FiscalYear", domain: "r2r", aggregateType: "fiscal-year", action: "create_fiscal_year", operationType: "create", description: "Create fiscal year", riskLevel: "Medium", governanceTag: "R2R.FiscalYear.Create" },
  {
    id: "r2r_close_fiscal_year",
    entity: "FiscalYear",
    domain: "r2r",
    aggregateType: "fiscal-year",
    action: "close_fiscal_year",
    actionAliases: ["close"],
    operationType: "transition",
    description: "Close fiscal year",
    riskLevel: "High",
    governanceTag: "R2R.FiscalYear.Close"
  },
  { id: "r2r_create_fiscal_period", entity: "FiscalPeriod", domain: "r2r", aggregateType: "fiscal-period", action: "create_fiscal_period", operationType: "create", description: "Create fiscal period", riskLevel: "Medium", governanceTag: "R2R.FiscalPeriod.Create" },
  {
    id: "r2r_start_period_close",
    entity: "FiscalPeriod",
    domain: "r2r",
    aggregateType: "fiscal-period",
    action: "start_period_close",
    actionAliases: ["beginClose", "start-close"],
    operationType: "transition",
    description: "Start fiscal period close",
    riskLevel: "High",
    governanceTag: "R2R.FiscalPeriod.StartClose"
  },
  {
    id: "r2r_close_fiscal_period",
    entity: "FiscalPeriod",
    domain: "r2r",
    aggregateType: "fiscal-period",
    action: "close_fiscal_period",
    actionAliases: ["close"],
    operationType: "transition",
    description: "Close fiscal period",
    riskLevel: "High",
    governanceTag: "R2R.FiscalPeriod.Close"
  },
  {
    id: "r2r_lock_fiscal_period",
    entity: "FiscalPeriod",
    domain: "r2r",
    aggregateType: "fiscal-period",
    action: "lock_fiscal_period",
    actionAliases: ["lock"],
    operationType: "transition",
    description: "Lock fiscal period",
    riskLevel: "High",
    governanceTag: "R2R.FiscalPeriod.Lock"
  },
  { id: "r2r_create_manual_journal", entity: "Journal", domain: "r2r", aggregateType: "journal", action: "create_manual_journal", operationType: "create", description: "Create manual journal", riskLevel: "Medium", governanceTag: "R2R.Journal.Create" },
  { id: "r2r_add_journal_line", entity: "Journal", domain: "r2r", aggregateType: "journal", action: "add_journal_line", operationType: "update", description: "Add journal line", riskLevel: "Medium", governanceTag: "R2R.Journal.Update" },
  {
    id: "r2r_post_journal",
    entity: "Journal",
    domain: "r2r",
    aggregateType: "journal",
    action: "post_journal",
    actionAliases: ["post"],
    operationType: "transition",
    description: "Post journal",
    riskLevel: "High",
    governanceTag: "R2R.Journal.Post"
  },
  {
    id: "r2r_reverse_journal",
    entity: "Journal",
    domain: "r2r",
    aggregateType: "journal",
    action: "reverse_journal",
    actionAliases: ["reverse"],
    operationType: "transition",
    description: "Reverse posted journal",
    riskLevel: "High",
    governanceTag: "R2R.Journal.Reverse"
  },
  {
    id: "r2r_cancel_journal",
    entity: "Journal",
    domain: "r2r",
    aggregateType: "journal",
    action: "cancel_journal",
    actionAliases: ["cancel"],
    operationType: "transition",
    description: "Cancel draft journal",
    riskLevel: "High",
    governanceTag: "R2R.Journal.Cancel"
  },
  { id: "r2r_get_trial_balance", entity: "TrialBalance", domain: "r2r", aggregateType: "trial-balance", action: "get_trial_balance", operationType: "query", description: "Get trial balance", riskLevel: "Low", governanceTag: "R2R.TrialBalance.Read" },

  { id: "r2r_list_tax_regimes",          entity: "TaxRegime",          domain: "r2r", aggregateType: "tax-regime",           action: "list_tax_regimes",           operationType: "query",      description: "List tax regimes",            riskLevel: "Low",    governanceTag: "R2R.Tax.Regime.List" },
  { id: "r2r_create_tax_regime",         entity: "TaxRegime",          domain: "r2r", aggregateType: "tax-regime",           action: "create_tax_regime",          operationType: "create",     description: "Create tax regime",           riskLevel: "Medium", governanceTag: "R2R.Tax.Regime.Create" },
  { id: "r2r_list_tax_jurisdictions",    entity: "TaxJurisdiction",    domain: "r2r", aggregateType: "tax-jurisdiction",     action: "list_tax_jurisdictions",     operationType: "query",      description: "List tax jurisdictions",      riskLevel: "Low",    governanceTag: "R2R.Tax.Jurisdiction.List" },
  { id: "r2r_create_tax_jurisdiction",   entity: "TaxJurisdiction",    domain: "r2r", aggregateType: "tax-jurisdiction",     action: "create_tax_jurisdiction",    operationType: "create",     description: "Create tax jurisdiction",     riskLevel: "Medium", governanceTag: "R2R.Tax.Jurisdiction.Create" },
  { id: "r2r_list_tax_codes",            entity: "TaxCode",            domain: "r2r", aggregateType: "tax-code",             action: "list_tax_codes",             operationType: "query",      description: "List tax codes",              riskLevel: "Low",    governanceTag: "R2R.Tax.Code.List" },
  { id: "r2r_create_tax_code",           entity: "TaxCode",            domain: "r2r", aggregateType: "tax-code",             action: "create_tax_code",            operationType: "create",     description: "Create tax code",             riskLevel: "Medium", governanceTag: "R2R.Tax.Code.Create" },
  { id: "r2r_list_tax_rates",            entity: "TaxRate",            domain: "r2r", aggregateType: "tax-rate",             action: "list_tax_rates",             operationType: "query",      description: "List tax rates",              riskLevel: "Low",    governanceTag: "R2R.Tax.Rate.List" },
  { id: "r2r_create_tax_rate",           entity: "TaxRate",            domain: "r2r", aggregateType: "tax-rate",             action: "create_tax_rate",            operationType: "create",     description: "Create tax rate",             riskLevel: "Medium", governanceTag: "R2R.Tax.Rate.Create" },
  { id: "r2r_list_tax_rules",            entity: "TaxRule",            domain: "r2r", aggregateType: "tax-rule",             action: "list_tax_rules",             operationType: "query",      description: "List tax rules",              riskLevel: "Low",    governanceTag: "R2R.Tax.Rule.List" },
  { id: "r2r_create_tax_rule",           entity: "TaxRule",            domain: "r2r", aggregateType: "tax-rule",             action: "create_tax_rule",            operationType: "create",     description: "Create tax rule",             riskLevel: "High",   governanceTag: "R2R.Tax.Rule.Create" },
  { id: "r2r_deactivate_tax_rule",       entity: "TaxRule",            domain: "r2r", aggregateType: "tax-rule",             action: "deactivate_tax_rule",        operationType: "transition", description: "Deactivate tax rule",         riskLevel: "High",   governanceTag: "R2R.Tax.Rule.Deactivate",   actionAliases: ["deactivate"] },
  { id: "r2r_list_tax_account_mappings", entity: "TaxAccountMapping",  domain: "r2r", aggregateType: "tax-account-mapping",  action: "list_tax_account_mappings",  operationType: "query",      description: "List tax account mappings",   riskLevel: "Low",    governanceTag: "R2R.Tax.AccountMapping.List" },
  { id: "r2r_create_tax_account_mapping",entity: "TaxAccountMapping",  domain: "r2r", aggregateType: "tax-account-mapping",  action: "create_tax_account_mapping", operationType: "create",     description: "Create tax account mapping",  riskLevel: "High",   governanceTag: "R2R.Tax.AccountMapping.Create" },
  { id: "r2r_list_tax_lines",            entity: "TaxTransactionLine", domain: "r2r", aggregateType: "tax-transaction-line", action: "list_tax_transaction_lines", operationType: "query",      description: "List tax transaction lines",  riskLevel: "Low",    governanceTag: "R2R.Tax.TransactionLine.List" },


  { id: "h2r_create_employee", entity: "Employee", domain: "h2r", aggregateType: "employee", action: "create_employee", operationType: "create", description: "Create employee", riskLevel: "Medium", governanceTag: "H2R.Employee.Create" },
  {
    id: "h2r_place_on_leave",
    entity: "Employee",
    domain: "h2r",
    aggregateType: "employee",
    action: "place_on_leave",
    actionAliases: ["goOnLeave", "place-on-leave", "leave"],
    operationType: "transition",
    description: "Place employee on leave",
    riskLevel: "Medium",
    governanceTag: "H2R.Employee.Leave"
  },
  {
    id: "h2r_return_from_leave",
    entity: "Employee",
    domain: "h2r",
    aggregateType: "employee",
    action: "return_from_leave",
    actionAliases: ["returnFromLeave", "return-from-leave", "return"],
    operationType: "transition",
    description: "Return employee from leave",
    riskLevel: "Low",
    governanceTag: "H2R.Employee.Return"
  },
  {
    id: "h2r_terminate_employee",
    entity: "Employee",
    domain: "h2r",
    aggregateType: "employee",
    action: "terminate_employee",
    actionAliases: ["terminate"],
    operationType: "transition",
    description: "Terminate employee",
    riskLevel: "High",
    governanceTag: "H2R.Employee.Terminate"
  },
  { id: "h2r_create_position", entity: "Position", domain: "h2r", aggregateType: "position", action: "create_position", operationType: "create", description: "Create position", riskLevel: "Medium", governanceTag: "H2R.Position.Create" },
  { id: "h2r_assign_position", entity: "Assignment", domain: "h2r", aggregateType: "assignment", action: "assign_position", operationType: "create", description: "Assign position", riskLevel: "Medium", governanceTag: "H2R.Assignment.Create" },
  { id: "h2r_end_assignment", entity: "Assignment", domain: "h2r", aggregateType: "assignment", action: "end_assignment", operationType: "transition", description: "End assignment", riskLevel: "Low", governanceTag: "H2R.Assignment.End" },
  { id: "h2r_issue_credential", entity: "Credential", domain: "h2r", aggregateType: "credential", action: "issue_credential", operationType: "create", description: "Issue credential", riskLevel: "Medium", governanceTag: "H2R.Credential.Issue" },
  { id: "h2r_expire_credential", entity: "Credential", domain: "h2r", aggregateType: "credential", action: "expire_credential", operationType: "transition", description: "Expire credential", riskLevel: "Low", governanceTag: "H2R.Credential.Expire" },
  { id: "h2r_revoke_credential", entity: "Credential", domain: "h2r", aggregateType: "credential", action: "revoke_credential", operationType: "transition", description: "Revoke credential", riskLevel: "High", governanceTag: "H2R.Credential.Revoke" },
  { id: "h2r_create_authority_rule", entity: "AuthorityRule", domain: "h2r", aggregateType: "authority-rule", action: "create_authority_rule", operationType: "create", description: "Create authority rule", riskLevel: "High", governanceTag: "H2R.AuthorityRule.Create" }
] as const;

export class McpCatalog {
  private readonly functions: McpFunction[];

  constructor(meshAdapterId: string) {
    this.functions = FUNCTION_DEFS.map((fn) => ({
      id: fn.id,
      name: fn.id,
      description: fn.description,
      entity: fn.entity,
      domain: fn.domain,
      aggregateType: fn.aggregateType,
      action: fn.action,
      actionAliases: (fn as Record<string, unknown>)["actionAliases"] as string[] | undefined,
      operationType: fn.operationType,
      inputSchema: (fn as Record<string, unknown>)["inputSchema"] as McpFunction["inputSchema"] ?? {
        type: "object",
        required: [],
        properties: {}
      },
      outputSchema: {
        type: "object",
        properties: {}
      },
      backingRoute: `/mesh/${meshAdapterId}/${fn.domain}/${fn.aggregateType}/{id}/${fn.action}`,
      riskLevel: fn.riskLevel,
      governanceTag: fn.governanceTag,
      requiredTier: tierFromRiskLevel(fn.riskLevel)
    }));
  }

  list(): McpFunction[] {
    return this.functions;
  }

  getById(id: string): McpFunction | undefined {
    return this.functions.find((fn) => fn.id === id);
  }

  getByEntityAndAction(entity: string, action: string): McpFunction | undefined {
    const entityKey = normalizeKey(entity);
    return this.functions.find(
      (fn) =>
        matchesAction(action, fn.action, fn.actionAliases) &&
        (normalizeKey(fn.entity) === entityKey || normalizeKey(fn.aggregateType) === entityKey)
    );
  }

  getByDomainAggregateAction(domain: string, aggregateType: string, action: string): McpFunction | undefined {
    const domainKey = normalizeKey(domain);
    const aggregateTypeKey = normalizeKey(aggregateType);

    return this.functions.find(
      (fn) =>
        normalizeKey(fn.domain) === domainKey &&
        normalizeKey(fn.aggregateType) === aggregateTypeKey &&
        matchesAction(action, fn.action, fn.actionAliases)
    );
  }

  listByDomainAggregateAndOperation(domain: string, aggregateType: string, operationType: OperationType): McpFunction[] {
    const domainKey = normalizeKey(domain);
    const aggregateTypeKey = normalizeKey(aggregateType);

    return this.functions.filter(
      (fn) =>
        normalizeKey(fn.domain) === domainKey &&
        normalizeKey(fn.aggregateType) === aggregateTypeKey &&
        fn.operationType === operationType
    );
  }

  requireById(id: string): McpFunction {
    const fn = this.getById(id);
    if (!fn) {
      throw new HttpError(404, "mcp_function_not_found", `Unknown MCP function id: ${id}`);
    }

    return fn;
  }
}
