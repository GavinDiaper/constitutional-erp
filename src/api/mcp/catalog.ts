export interface McpFunctionDef {
  name: string;
  domain: "o2c" | "p2p" | "r2r" | "h2r";
  description: string;
  entity?: string; // e.g., "Customer", "PurchaseOrder", "Employee"
  action?: string; // e.g., "create", "activate", "approve"
  riskLevel?: "Low" | "Medium" | "High";
  governanceTag?: string; // e.g., "O2C.Customer.Create" or "P2P.PO.Approve"
}

export const mcpCatalog: McpFunctionDef[] = [
  // ── O2C ──────────────────────────────────────────────────────────────────
  { name: "o2c_create_customer", domain: "o2c", entity: "Customer", action: "create", description: "Create a customer in Draft state", riskLevel: "Low", governanceTag: "O2C.Customer.Create" },
  { name: "o2c_activate_customer", domain: "o2c", entity: "Customer", action: "activate", description: "Activate a Draft customer", riskLevel: "Low", governanceTag: "O2C.Customer.Activate" },
  { name: "o2c_create_quote", domain: "o2c", entity: "Quote", action: "create", description: "Create a sales quote in Draft state", riskLevel: "Low", governanceTag: "O2C.Quote.Create" },
  { name: "o2c_add_quote_line", domain: "o2c", entity: "Quote", action: "addLine", description: "Add a line item to a quote", riskLevel: "Low", governanceTag: "O2C.Quote.AddLine" },
  { name: "o2c_send_quote", domain: "o2c", entity: "Quote", action: "send", description: "Send a Draft quote to the customer", riskLevel: "Low", governanceTag: "O2C.Quote.Send" },
  { name: "o2c_accept_quote", domain: "o2c", entity: "Quote", action: "accept", description: "Accept a Sent quote", riskLevel: "Low", governanceTag: "O2C.Quote.Accept" },
  { name: "o2c_reject_quote", domain: "o2c", entity: "Quote", action: "reject", description: "Reject a Draft or Sent quote", riskLevel: "Low", governanceTag: "O2C.Quote.Reject" },
  { name: "o2c_expire_quote", domain: "o2c", entity: "Quote", action: "expire", description: "Mark a Sent quote as Expired", riskLevel: "Low", governanceTag: "O2C.Quote.Expire" },
  { name: "o2c_convert_quote_to_order", domain: "o2c", entity: "Quote", action: "convertToOrder", description: "Convert an Accepted quote to a sales order", riskLevel: "Medium", governanceTag: "O2C.Quote.Convert" },
  { name: "o2c_confirm_order", domain: "o2c", entity: "Order", action: "confirm", description: "Confirm a Draft sales order", riskLevel: "Medium", governanceTag: "O2C.Order.Confirm" },
  { name: "o2c_allocate_order", domain: "o2c", entity: "Order", action: "allocate", description: "Allocate stock for a Confirmed order", riskLevel: "Medium", governanceTag: "O2C.Order.Allocate" },
  { name: "o2c_ship_order", domain: "o2c", entity: "Order", action: "ship", description: "Mark an Allocated order as Shipped", riskLevel: "Low", governanceTag: "O2C.Order.Ship" },
  { name: "o2c_close_order", domain: "o2c", entity: "Order", action: "close", description: "Close a Shipped order", riskLevel: "Low", governanceTag: "O2C.Order.Close" },
  { name: "o2c_cancel_order", domain: "o2c", entity: "Order", action: "cancel", description: "Cancel a sales order", riskLevel: "High", governanceTag: "O2C.Order.Cancel" },
  { name: "o2c_generate_invoice", domain: "o2c", entity: "Order", action: "generateInvoice", description: "Generate an AR invoice from a Shipped order", riskLevel: "Medium", governanceTag: "O2C.Order.GenerateInvoice" },
  { name: "o2c_create_shipment", domain: "o2c", entity: "Shipment", action: "create", description: "Create shipment for a Confirmed or Allocated order", riskLevel: "Low", governanceTag: "O2C.Shipment.Create" },
  { name: "o2c_execute_shipment", domain: "o2c", entity: "Shipment", action: "execute", description: "Mark a Planned shipment as Shipped", riskLevel: "Low", governanceTag: "O2C.Shipment.Execute" },
  { name: "o2c_deliver_shipment", domain: "o2c", entity: "Shipment", action: "deliver", description: "Mark a Shipped shipment as Delivered", riskLevel: "Low", governanceTag: "O2C.Shipment.Deliver" },
  { name: "o2c_cancel_shipment", domain: "o2c", entity: "Shipment", action: "cancel", description: "Cancel a shipment", riskLevel: "Medium", governanceTag: "O2C.Shipment.Cancel" },
  { name: "o2c_post_ar_invoice", domain: "o2c", entity: "ARInvoice", action: "post", description: "Post a Draft AR invoice", riskLevel: "Medium", governanceTag: "O2C.ARInvoice.Post" },
  { name: "o2c_cancel_ar_invoice", domain: "o2c", entity: "ARInvoice", action: "cancel", description: "Cancel an AR invoice", riskLevel: "High", governanceTag: "O2C.ARInvoice.Cancel" },
  { name: "o2c_register_payment", domain: "o2c", entity: "ARPayment", action: "register", description: "Register an AR payment receipt", riskLevel: "Medium", governanceTag: "O2C.ARPayment.Register" },
  { name: "o2c_apply_ar_payment", domain: "o2c", entity: "ARPayment", action: "apply", description: "Apply a Received AR payment to an invoice", riskLevel: "Medium", governanceTag: "O2C.ARPayment.Apply" },
  { name: "o2c_reconcile_ar_payment", domain: "o2c", entity: "ARPayment", action: "reconcile", description: "Reconcile an Applied AR payment", riskLevel: "Medium", governanceTag: "O2C.ARPayment.Reconcile" },
  { name: "o2c_cancel_ar_payment", domain: "o2c", entity: "ARPayment", action: "cancel", description: "Cancel an AR payment", riskLevel: "High", governanceTag: "O2C.ARPayment.Cancel" },

  // ── P2P ──────────────────────────────────────────────────────────────────
  { name: "p2p_create_requisition", domain: "p2p", entity: "Requisition", action: "create", description: "Create a purchase requisition in Draft state", riskLevel: "Low", governanceTag: "P2P.Requisition.Create" },
  { name: "p2p_submit_requisition", domain: "p2p", entity: "Requisition", action: "submit", description: "Submit a Draft requisition for approval", riskLevel: "Low", governanceTag: "P2P.Requisition.Submit" },
  { name: "p2p_approve_requisition", domain: "p2p", entity: "Requisition", action: "approve", description: "Approve a Submitted requisition", riskLevel: "Medium", governanceTag: "P2P.Requisition.Approve" },
  { name: "p2p_reject_requisition", domain: "p2p", entity: "Requisition", action: "reject", description: "Reject a Submitted requisition", riskLevel: "Low", governanceTag: "P2P.Requisition.Reject" },
  { name: "p2p_cancel_requisition", domain: "p2p", entity: "Requisition", action: "cancel", description: "Cancel a Draft or Submitted requisition", riskLevel: "Low", governanceTag: "P2P.Requisition.Cancel" },
  { name: "p2p_convert_requisition_to_po", domain: "p2p", entity: "Requisition", action: "convertToPO", description: "Convert an Approved requisition to a PO", riskLevel: "Medium", governanceTag: "P2P.Requisition.Convert" },
  { name: "p2p_create_supplier", domain: "p2p", entity: "Supplier", action: "create", description: "Create a supplier in Draft state", riskLevel: "Low", governanceTag: "P2P.Supplier.Create" },
  { name: "p2p_activate_supplier", domain: "p2p", entity: "Supplier", action: "activate", description: "Activate a Draft supplier", riskLevel: "Medium", governanceTag: "P2P.Supplier.Activate" },
  { name: "p2p_suspend_supplier", domain: "p2p", entity: "Supplier", action: "suspend", description: "Suspend an Active supplier", riskLevel: "High", governanceTag: "P2P.Supplier.Suspend" },
  { name: "p2p_create_po", domain: "p2p", entity: "PurchaseOrder", action: "create", description: "Create a purchase order in Draft state", riskLevel: "Low", governanceTag: "P2P.PO.Create" },
  { name: "p2p_approve_po", domain: "p2p", entity: "PurchaseOrder", action: "approve", description: "Approve a Draft purchase order", riskLevel: "High", governanceTag: "P2P.PO.Approve" },
  { name: "p2p_send_po", domain: "p2p", entity: "PurchaseOrder", action: "send", description: "Send an Approved purchase order to the supplier", riskLevel: "Medium", governanceTag: "P2P.PO.Send" },
  { name: "p2p_receive_goods_on_po", domain: "p2p", entity: "PurchaseOrder", action: "receiveGoods", description: "Record goods receipt against a Sent PO", riskLevel: "Medium", governanceTag: "P2P.PO.ReceiveGoods" },
  { name: "p2p_close_po", domain: "p2p", entity: "PurchaseOrder", action: "close", description: "Close a fully received purchase order", riskLevel: "Low", governanceTag: "P2P.PO.Close" },
  { name: "p2p_cancel_po", domain: "p2p", entity: "PurchaseOrder", action: "cancel", description: "Cancel a purchase order", riskLevel: "High", governanceTag: "P2P.PO.Cancel" },
  { name: "p2p_create_goods_receipt", domain: "p2p", entity: "GoodsReceipt", action: "create", description: "Create a goods receipt from a Sent/PartiallyReceived PO", riskLevel: "Low", governanceTag: "P2P.GoodsReceipt.Create" },
  { name: "p2p_goods_receipt_receive", domain: "p2p", entity: "GoodsReceipt", action: "receive", description: "Mark goods receipt as Received", riskLevel: "Low", governanceTag: "P2P.GoodsReceipt.Receive" },
  { name: "p2p_goods_receipt_accept", domain: "p2p", entity: "GoodsReceipt", action: "accept", description: "Accept a Received goods receipt", riskLevel: "Medium", governanceTag: "P2P.GoodsReceipt.Accept" },
  { name: "p2p_create_supplier_invoice", domain: "p2p", entity: "SupplierInvoice", action: "create", description: "Create a supplier invoice from an Accepted receipt", riskLevel: "Medium", governanceTag: "P2P.SupplierInvoice.Create" },
  { name: "p2p_validate_invoice", domain: "p2p", entity: "SupplierInvoice", action: "validate", description: "Validate a Draft supplier invoice", riskLevel: "Medium", governanceTag: "P2P.SupplierInvoice.Validate" },
  { name: "p2p_post_supplier_invoice", domain: "p2p", entity: "SupplierInvoice", action: "post", description: "Post a Validated supplier invoice", riskLevel: "High", governanceTag: "P2P.SupplierInvoice.Post" },
  { name: "p2p_cancel_invoice", domain: "p2p", entity: "SupplierInvoice", action: "cancel", description: "Cancel a supplier invoice", riskLevel: "High", governanceTag: "P2P.SupplierInvoice.Cancel" },
  { name: "p2p_create_ap_payment", domain: "p2p", entity: "APPayment", action: "create", description: "Create an AP payment in Draft state", riskLevel: "Low", governanceTag: "P2P.APPayment.Create" },
  { name: "p2p_receive_ap_payment", domain: "p2p", entity: "APPayment", action: "receive", description: "Mark an AP payment as Received", riskLevel: "Medium", governanceTag: "P2P.APPayment.Receive" },
  { name: "p2p_apply_ap_payment", domain: "p2p", entity: "APPayment", action: "apply", description: "Apply a Received AP payment to an invoice", riskLevel: "High", governanceTag: "P2P.APPayment.Apply" },
  { name: "p2p_reconcile_ap_payment", domain: "p2p", entity: "APPayment", action: "reconcile", description: "Reconcile an Applied AP payment", riskLevel: "Medium", governanceTag: "P2P.APPayment.Reconcile" },
  { name: "p2p_cancel_ap_payment", domain: "p2p", entity: "APPayment", action: "cancel", description: "Cancel an AP payment", riskLevel: "High", governanceTag: "P2P.APPayment.Cancel" },

  // ── R2R ──────────────────────────────────────────────────────────────────
  { name: "r2r_create_ledger", domain: "r2r", entity: "Ledger", action: "create", description: "Create a general ledger", riskLevel: "Low", governanceTag: "R2R.Ledger.Create" },
  { name: "r2r_create_account", domain: "r2r", entity: "Account", action: "create", description: "Create a chart of accounts entry", riskLevel: "Low", governanceTag: "R2R.Account.Create" },
  { name: "r2r_create_fiscal_year", domain: "r2r", entity: "FiscalYear", action: "create", description: "Create a fiscal year in Open state", riskLevel: "Low", governanceTag: "R2R.FiscalYear.Create" },
  { name: "r2r_start_year_close", domain: "r2r", entity: "FiscalYear", action: "startClose", description: "Place a fiscal year in Closing state", riskLevel: "High", governanceTag: "R2R.FiscalYear.StartClose" },
  { name: "r2r_close_fiscal_year", domain: "r2r", entity: "FiscalYear", action: "close", description: "Close a fiscal year", riskLevel: "High", governanceTag: "R2R.FiscalYear.Close" },
  { name: "r2r_create_fiscal_period", domain: "r2r", entity: "FiscalPeriod", action: "create", description: "Create a fiscal period in Open state", riskLevel: "Low", governanceTag: "R2R.FiscalPeriod.Create" },
  { name: "r2r_start_period_close", domain: "r2r", entity: "FiscalPeriod", action: "startClose", description: "Place a fiscal period in Closing state", riskLevel: "High", governanceTag: "R2R.FiscalPeriod.StartClose" },
  { name: "r2r_close_fiscal_period", domain: "r2r", entity: "FiscalPeriod", action: "close", description: "Close a fiscal period", riskLevel: "High", governanceTag: "R2R.FiscalPeriod.Close" },
  { name: "r2r_lock_fiscal_period", domain: "r2r", entity: "FiscalPeriod", action: "lock", description: "Lock a Closed fiscal period", riskLevel: "High", governanceTag: "R2R.FiscalPeriod.Lock" },
  { name: "r2r_create_manual_journal", domain: "r2r", entity: "Journal", action: "create", description: "Create a journal in Draft state", riskLevel: "Low", governanceTag: "R2R.Journal.Create" },
  { name: "r2r_add_journal_line", domain: "r2r", entity: "Journal", action: "addLine", description: "Add a debit/credit line to a journal", riskLevel: "Low", governanceTag: "R2R.Journal.AddLine" },
  { name: "r2r_post_journal", domain: "r2r", entity: "Journal", action: "post", description: "Post a Draft journal", riskLevel: "High", governanceTag: "R2R.Journal.Post" },
  { name: "r2r_reverse_journal", domain: "r2r", entity: "Journal", action: "reverse", description: "Reverse a Posted journal", riskLevel: "High", governanceTag: "R2R.Journal.Reverse" },
  { name: "r2r_cancel_journal", domain: "r2r", entity: "Journal", action: "cancel", description: "Cancel a Draft journal", riskLevel: "Low", governanceTag: "R2R.Journal.Cancel" },
  { name: "r2r_get_trial_balance", domain: "r2r", entity: "Journal", action: "getTrial Balance", description: "Get trial balance for a fiscal period", riskLevel: "Low", governanceTag: "R2R.Journal.GetTrialBalance" },

  // ── H2R ──────────────────────────────────────────────────────────────────
  { name: "h2r_create_employee", domain: "h2r", entity: "Employee", action: "create", description: "Create an employee (Candidate by default, or Active when requested)", riskLevel: "Low", governanceTag: "H2R.Employee.Create" },
  { name: "h2r_activate_employee", domain: "h2r", entity: "Employee", action: "activate", description: "Activate a Candidate employee", riskLevel: "Medium", governanceTag: "H2R.Employee.Activate" },
  { name: "h2r_place_on_leave", domain: "h2r", entity: "Employee", action: "placeOnLeave", description: "Place an Active employee on leave", riskLevel: "Low", governanceTag: "H2R.Employee.PlaceOnLeave" },
  { name: "h2r_return_from_leave", domain: "h2r", entity: "Employee", action: "returnFromLeave", description: "Return an OnLeave employee to Active", riskLevel: "Low", governanceTag: "H2R.Employee.ReturnFromLeave" },
  { name: "h2r_terminate_employee", domain: "h2r", entity: "Employee", action: "terminate", description: "Terminate an employee", riskLevel: "High", governanceTag: "H2R.Employee.Terminate" },
  { name: "h2r_create_position", domain: "h2r", entity: "Position", action: "create", description: "Create a position with authority tier", riskLevel: "Low", governanceTag: "H2R.Position.Create" },
  { name: "h2r_create_assignment", domain: "h2r", entity: "Assignment", action: "create", description: "Create an assignment in Planned state", riskLevel: "Low", governanceTag: "H2R.Assignment.Create" },
  { name: "h2r_activate_assignment", domain: "h2r", entity: "Assignment", action: "activate", description: "Activate a Planned assignment", riskLevel: "Medium", governanceTag: "H2R.Assignment.Activate" },
  { name: "h2r_complete_assignment", domain: "h2r", entity: "Assignment", action: "complete", description: "Complete an Active assignment", riskLevel: "Low", governanceTag: "H2R.Assignment.Complete" },
  { name: "h2r_cancel_assignment", domain: "h2r", entity: "Assignment", action: "cancel", description: "Cancel an assignment", riskLevel: "Medium", governanceTag: "H2R.Assignment.Cancel" },
  { name: "h2r_end_assignment", domain: "h2r", entity: "Assignment", action: "end", description: "End an assignment (alias for complete)", riskLevel: "Low", governanceTag: "H2R.Assignment.End" },
  { name: "h2r_issue_credential", domain: "h2r", entity: "Credential", action: "issue", description: "Issue a credential in Valid status", riskLevel: "Medium", governanceTag: "H2R.Credential.Issue" },
  { name: "h2r_expire_credential", domain: "h2r", entity: "Credential", action: "expire", description: "Expire a Valid credential", riskLevel: "Low", governanceTag: "H2R.Credential.Expire" },
  { name: "h2r_revoke_credential", domain: "h2r", entity: "Credential", action: "revoke", description: "Revoke a Valid credential", riskLevel: "High", governanceTag: "H2R.Credential.Revoke" },
  { name: "h2r_create_authority_rule", domain: "h2r", entity: "AuthorityRule", action: "create", description: "Create an authority approval rule", riskLevel: "High", governanceTag: "H2R.AuthorityRule.Create" }
];
