import { z } from "zod";
import type { McpFunctionDef } from "./catalog";
import type { McpStateGuard } from "./registry";
import { readModel } from "./readModel";

const inputFieldsByTool: Record<string, string> = Object.fromEntries(
  `
o2c_create_customer customerName,email,billingAddress,shippingAddress
o2c_create_contract customerId,externalReference,name,version
o2c_amend_contract contractId,version
o2c_approve_contract contractId,versionNumber
o2c_activate_customer customerId
o2c_create_quote customerId,currencyCode,legalEntityId,projectId
o2c_add_quote_line quoteId,sku,quantity,unitPrice,taxTreatment,taxCodeId,countryCode
o2c_send_quote quoteId
o2c_accept_quote quoteId
o2c_reject_quote quoteId
o2c_expire_quote quoteId
o2c_convert_quote_to_order quoteId,legalEntityId,projectId,wbsId
o2c_assign_order_project orderId,projectId,wbsId
o2c_confirm_order orderId
o2c_allocate_order orderId
o2c_ship_order orderId
o2c_close_order orderId
o2c_cancel_order orderId
o2c_generate_invoice orderId,taxCodeId,countryCode
o2c_create_shipment orderId
o2c_execute_shipment shipmentId,carrier,trackingNumber
o2c_deliver_shipment shipmentId
o2c_cancel_shipment shipmentId
o2c_post_ar_invoice invoiceId
o2c_cancel_ar_invoice invoiceId
o2c_register_payment invoiceId,amount,currencyCode,method,paymentDate
o2c_apply_ar_payment paymentId
o2c_reconcile_ar_payment paymentId
o2c_cancel_ar_payment paymentId
p2p_create_requisition requester,department,currencyCode,neededByDate,legalEntityId
p2p_submit_requisition requisitionId
p2p_approve_requisition requisitionId
p2p_reject_requisition requisitionId
p2p_add_requisition_line requisitionId,description,quantity,unitPrice,taxCodeId,countryCode
p2p_add_po_line poId,description,quantity,unitPrice
p2p_cancel_requisition requisitionId
p2p_convert_requisition_to_po requisitionId,supplierId,legalEntityId
p2p_create_supplier supplierName,email,paymentTerms,taxId,currencyCode
p2p_activate_supplier supplierId
p2p_suspend_supplier supplierId
p2p_create_po supplierId,requisitionId,totalAmount,currencyCode,deliveryAddress,legalEntityId
p2p_approve_po poId
p2p_send_po poId
p2p_receive_goods_on_po poId,isPartial
p2p_close_po poId
p2p_cancel_po poId
p2p_create_goods_receipt poId
p2p_goods_receipt_receive receiptId
p2p_goods_receipt_accept receiptId,isPartial
p2p_create_supplier_invoice receiptId,invoiceDate,dueDate,currencyCode
p2p_validate_invoice supplierInvoiceId
p2p_post_supplier_invoice supplierInvoiceId
p2p_cancel_invoice supplierInvoiceId
p2p_create_ap_payment supplierInvoiceId,amount,currencyCode,method
p2p_receive_ap_payment apPaymentId
p2p_apply_ap_payment apPaymentId
p2p_reconcile_ap_payment apPaymentId
p2p_cancel_ap_payment apPaymentId
r2r_create_ledger name,currencyCode,calendar,chartOfAccountsRef
r2r_create_account accountCode,accountName,accountType
r2r_create_fiscal_year yearLabel,startDate,endDate
r2r_start_year_close fiscalYearId
r2r_close_fiscal_year fiscalYearId
r2r_create_fiscal_period fiscalYearId,periodNumber,startDate,endDate
r2r_start_period_close fiscalPeriodId
r2r_close_fiscal_period fiscalPeriodId
r2r_lock_fiscal_period fiscalPeriodId
r2r_create_manual_journal fiscalPeriodId,description
r2r_add_journal_line journalId,accountId,debitAmount,creditAmount,memo
r2r_post_journal journalId
r2r_reverse_journal journalId
r2r_cancel_journal journalId
r2r_get_trial_balance fiscalPeriodId
h2r_create_employee name,email,active,status
h2r_activate_employee employeeId
h2r_place_on_leave employeeId
h2r_return_from_leave employeeId
h2r_terminate_employee employeeId
h2r_create_position title,department,authorityDomain,authorityTier
h2r_create_assignment employeeId,positionId,startDate,endDate,department,role
h2r_activate_assignment assignmentId
h2r_complete_assignment assignmentId
h2r_cancel_assignment assignmentId
h2r_end_assignment assignmentId
h2r_issue_credential employeeId,type,expiryDate
h2r_expire_credential credentialId
h2r_revoke_credential credentialId
h2r_create_authority_rule domain,threshold,requiredTier
inv_create_sku skuCode,description,category,uom,skuType,valuationMethod,standardCost
inv_create_organization name,ledgerId,inventoryAssetAccountCode,cogsAccountCode
inv_post_movement skuId,organizationId,movementType,quantity,unitCost,reason,referenceType,referenceId,correlationKey,projectWipId,projectId,bomId,bomComponentFlag,isProjectFinishedGood
inv_create_reservation skuId,organizationId,reservationType,quantity,referenceType,referenceId,reason,correlationKey,expiresAt
inv_release_reservation reservationId,reason,expectedVersion
inv_create_bin organizationId,binCode,zone,aisle,rack,shelfLevel
inv_putaway_to_bin skuId,organizationId,binId,quantity,reason,referenceType,referenceId,correlationKey
inv_pick_from_bin skuId,organizationId,binId,quantity,reason,referenceType,referenceId,correlationKey
inv_create_cycle_count organizationId,binId,reason,scheduledFor
inv_record_cycle_count_line cycleCountId,skuId,countedQuantity,reason
inv_post_cycle_count cycleCountId
inv_create_lot skuId,organizationId,lotCode,quantityOnHand,manufactureDate,expiryDate
inv_consume_lot lotId,quantity,reason
inv_create_serial skuId,organizationId,serialNumber,lotId
inv_consume_serial serialId,reason
inv_issue_to_project skuId,organizationId,quantity,unitCost,reason,assignmentId,projectId,bomId
bom_create_bom skuId,organizationId,revision,description,projectEligible,costingProfile,effectiveDate,endDate
bom_add_component bomId,componentSkuId,componentLineNumber,componentDescription,quantity,quantityUom,scrapPercentage,isPhantom,standardCost,costElementId
bom_activate_bom bomId
proj_create_project projectId,name,description,projectType,customerId,contractId,wbsId,budgetAmount,defaultWIPAccountId,defaultCloseAccountId,startDate,endDate,projectManagerId,organizationId
proj_activate_project projectId
proj_hold_project projectId,holdReason
proj_resume_project projectId
proj_complete_project projectId,completionType,closeAccountId
proj_cancel_project projectId,cancellationReason,forceCancel
proj_assign_bom projectId,bomId,wbsId,quantityPlanned
proj_post_labor_cost projectId,wbsId,resourceId,hours,rate,costElementId
proj_create_finished_item projectId,skuId,organizationId,quantity,unitCost
  `
    .trim()
    .split("\n")
    .map((line) => {
      const [name, fields] = line.trim().split(/\s+/, 2);
      return [name, fields];
    })
);

const numberFields = new Set([
  "amount", "authorityTier", "budgetAmount", "componentLineNumber", "countedQuantity", "creditAmount",
  "debitAmount", "expectedVersion", "hours", "limit", "offset", "periodNumber", "quantity",
  "quantityOnHand", "quantityPlanned", "rate", "requiredTier", "scrapPercentage",
  "standardCost", "threshold", "totalAmount", "unitCost", "unitPrice", "versionNumber"
]);
const booleanFields = new Set(["active", "bomComponentFlag", "forceCancel", "isPartial", "isPhantom", "isProjectFinishedGood", "projectEligible"]);
const dateFields = new Set(["dueDate", "effectiveDate", "endDate", "expiryDate", "invoiceDate", "manufactureDate", "neededByDate", "paymentDate", "scheduledFor", "startDate"]);
const enumFields: Record<string, [string, ...string[]]> = {
  accountType: ["Asset", "Liability", "Equity", "Revenue", "Expense"],
  completionType: ["FG_Conversion", "Expense_Close"],
  movementType: ["receipt", "issue", "adjustment", "cost_update"],
  projectType: ["Internal", "Capital", "Billable", "Service"],
  reservationType: ["soft", "hard"],
  skuType: ["physical", "service"],
  status: ["Candidate", "Active"],
  valuationMethod: ["standard", "moving_average"]
};

const requiredByTool: Record<string, string[]> = {
  o2c_create_customer: ["customerName"],
  o2c_create_contract: ["customerId", "name", "version"],
  o2c_amend_contract: ["contractId", "version"],
  o2c_approve_contract: ["contractId", "versionNumber"],
  o2c_create_quote: ["customerId", "currencyCode", "legalEntityId"],
  o2c_add_quote_line: ["quoteId", "sku", "quantity", "unitPrice"],
  o2c_convert_quote_to_order: ["quoteId", "legalEntityId"],
  o2c_assign_order_project: ["orderId", "projectId"],
  o2c_generate_invoice: ["orderId"],
  o2c_execute_shipment: ["shipmentId"],
  o2c_register_payment: ["invoiceId", "amount", "currencyCode", "method", "paymentDate"],
  p2p_create_requisition: ["requester", "department", "currencyCode"],
  p2p_add_requisition_line: ["requisitionId", "description", "quantity", "unitPrice"],
  p2p_add_po_line: ["poId", "description", "quantity", "unitPrice"],
  p2p_convert_requisition_to_po: ["requisitionId", "supplierId", "legalEntityId"],
  p2p_create_supplier: ["supplierName"],
  p2p_create_po: ["supplierId", "currencyCode", "legalEntityId"],
  p2p_create_goods_receipt: ["poId"],
  p2p_create_supplier_invoice: ["receiptId"],
  p2p_create_ap_payment: ["supplierInvoiceId", "amount", "currencyCode", "method"],
  r2r_create_ledger: ["name", "currencyCode"],
  r2r_create_account: ["accountCode", "accountName", "accountType"],
  r2r_create_fiscal_year: ["yearLabel", "startDate", "endDate"],
  r2r_create_fiscal_period: ["fiscalYearId", "periodNumber", "startDate", "endDate"],
  r2r_create_manual_journal: ["fiscalPeriodId", "description"],
  r2r_add_journal_line: ["journalId", "accountId"],
  h2r_create_employee: ["name"],
  h2r_create_position: ["title", "department", "authorityDomain", "authorityTier"],
  h2r_create_assignment: ["employeeId", "positionId", "startDate"],
  h2r_issue_credential: ["employeeId", "type"],
  h2r_create_authority_rule: ["domain", "threshold", "requiredTier"],
  inv_create_sku: ["skuCode", "description", "uom"],
  inv_create_organization: ["name", "ledgerId"],
  inv_post_movement: ["skuId", "organizationId", "movementType", "quantity"],
  inv_create_reservation: ["skuId", "organizationId", "reservationType", "quantity"],
  inv_release_reservation: ["reservationId"],
  inv_create_bin: ["organizationId", "binCode"],
  inv_putaway_to_bin: ["skuId", "organizationId", "binId", "quantity"],
  inv_pick_from_bin: ["skuId", "organizationId", "binId", "quantity"],
  inv_create_cycle_count: ["organizationId"],
  inv_record_cycle_count_line: ["cycleCountId", "skuId", "countedQuantity"],
  inv_post_cycle_count: ["cycleCountId"],
  inv_create_lot: ["skuId", "organizationId", "lotCode", "quantityOnHand"],
  inv_consume_lot: ["lotId", "quantity"],
  inv_create_serial: ["skuId", "organizationId", "serialNumber"],
  inv_consume_serial: ["serialId"],
  inv_issue_to_project: ["skuId", "organizationId", "quantity", "projectId"],
  bom_create_bom: ["skuId", "organizationId", "revision"],
  bom_add_component: ["bomId", "componentSkuId", "quantity"],
  proj_create_project: ["name", "projectType", "budgetAmount", "defaultWIPAccountId", "defaultCloseAccountId", "projectManagerId", "organizationId", "startDate"],
  proj_hold_project: ["projectId", "holdReason"],
  proj_complete_project: ["projectId", "completionType"],
  proj_cancel_project: ["projectId", "cancellationReason"],
  proj_assign_bom: ["projectId", "bomId", "quantityPlanned"],
  proj_post_labor_cost: ["projectId", "resourceId", "hours", "rate"],
  proj_create_finished_item: ["projectId", "skuId", "organizationId", "quantity"]
};

const lifecycle: Record<string, { table: string; idField: string; from: string[] }> = {
  o2c_activate_customer: { table: "o2c_customer", idField: "customerId", from: ["Draft"] },
  o2c_amend_contract: { table: "o2c_contract", idField: "contractId", from: ["Active"] },
  o2c_send_quote: { table: "o2c_quote", idField: "quoteId", from: ["Draft"] },
  o2c_accept_quote: { table: "o2c_quote", idField: "quoteId", from: ["Sent"] },
  o2c_reject_quote: { table: "o2c_quote", idField: "quoteId", from: ["Draft", "Sent"] },
  o2c_expire_quote: { table: "o2c_quote", idField: "quoteId", from: ["Sent"] },
  o2c_convert_quote_to_order: { table: "o2c_quote", idField: "quoteId", from: ["Accepted"] },
  o2c_add_quote_line: { table: "o2c_quote", idField: "quoteId", from: ["Draft", "Sent"] },
  o2c_create_shipment: { table: "o2c_sales_order", idField: "orderId", from: ["Confirmed", "Allocated"] },
  o2c_generate_invoice: { table: "o2c_sales_order", idField: "orderId", from: ["Confirmed", "Allocated", "Shipped"] },
  o2c_confirm_order: { table: "o2c_sales_order", idField: "orderId", from: ["Draft"] },
  o2c_allocate_order: { table: "o2c_sales_order", idField: "orderId", from: ["Confirmed"] },
  o2c_ship_order: { table: "o2c_sales_order", idField: "orderId", from: ["Allocated"] },
  o2c_close_order: { table: "o2c_sales_order", idField: "orderId", from: ["Paid"] },
  o2c_cancel_order: { table: "o2c_sales_order", idField: "orderId", from: ["Draft", "Confirmed", "Allocated", "Shipped"] },
  o2c_execute_shipment: { table: "o2c_shipment", idField: "shipmentId", from: ["Planned"] },
  o2c_deliver_shipment: { table: "o2c_shipment", idField: "shipmentId", from: ["Shipped"] },
  o2c_register_payment: { table: "o2c_invoice", idField: "invoiceId", from: ["Posted", "Paid"] },
  o2c_post_ar_invoice: { table: "o2c_invoice", idField: "invoiceId", from: ["Draft"] },
  o2c_cancel_ar_invoice: { table: "o2c_invoice", idField: "invoiceId", from: ["Draft", "Posted"] },
  o2c_apply_ar_payment: { table: "o2c_payment", idField: "paymentId", from: ["Received"] },
  o2c_reconcile_ar_payment: { table: "o2c_payment", idField: "paymentId", from: ["Applied"] },
  o2c_cancel_ar_payment: { table: "o2c_payment", idField: "paymentId", from: ["Received", "Applied"] },
  o2c_cancel_shipment: { table: "o2c_shipment", idField: "shipmentId", from: ["Planned", "Shipped"] },
  p2p_add_requisition_line: { table: "p2p_requisition", idField: "requisitionId", from: ["Draft"] },
  p2p_add_po_line: { table: "p2p_purchase_order", idField: "poId", from: ["Draft"] },
  p2p_submit_requisition: { table: "p2p_requisition", idField: "requisitionId", from: ["Draft"] },
  p2p_approve_requisition: { table: "p2p_requisition", idField: "requisitionId", from: ["Submitted"] },
  p2p_reject_requisition: { table: "p2p_requisition", idField: "requisitionId", from: ["Submitted"] },
  p2p_cancel_requisition: { table: "p2p_requisition", idField: "requisitionId", from: ["Draft", "Submitted", "Approved"] },
  p2p_convert_requisition_to_po: { table: "p2p_requisition", idField: "requisitionId", from: ["Approved"] },
  p2p_activate_supplier: { table: "p2p_supplier", idField: "supplierId", from: ["Draft"] },
  p2p_suspend_supplier: { table: "p2p_supplier", idField: "supplierId", from: ["Active"] },
  p2p_approve_po: { table: "p2p_purchase_order", idField: "poId", from: ["Draft"] },
  p2p_send_po: { table: "p2p_purchase_order", idField: "poId", from: ["Approved"] },
  p2p_receive_goods_on_po: { table: "p2p_purchase_order", idField: "poId", from: ["Sent", "PartiallyReceived"] },
  p2p_close_po: { table: "p2p_purchase_order", idField: "poId", from: ["FullyReceived"] },
  p2p_cancel_po: { table: "p2p_purchase_order", idField: "poId", from: ["Draft", "Approved", "Sent"] },
  p2p_create_goods_receipt: { table: "p2p_purchase_order", idField: "poId", from: ["Sent", "PartiallyReceived"] },
  p2p_goods_receipt_receive: { table: "p2p_goods_receipt", idField: "receiptId", from: ["Draft"] },
  p2p_goods_receipt_accept: { table: "p2p_goods_receipt", idField: "receiptId", from: ["Received"] },
  p2p_validate_invoice: { table: "p2p_supplier_invoice", idField: "supplierInvoiceId", from: ["Draft"] },
  p2p_post_supplier_invoice: { table: "p2p_supplier_invoice", idField: "supplierInvoiceId", from: ["Validated"] },
  p2p_cancel_invoice: { table: "p2p_supplier_invoice", idField: "supplierInvoiceId", from: ["Draft", "Validated", "Posted"] },
  p2p_receive_ap_payment: { table: "p2p_ap_payment", idField: "apPaymentId", from: ["Draft"] },
  p2p_apply_ap_payment: { table: "p2p_ap_payment", idField: "apPaymentId", from: ["Received"] },
  p2p_reconcile_ap_payment: { table: "p2p_ap_payment", idField: "apPaymentId", from: ["Applied"] },
  p2p_cancel_ap_payment: { table: "p2p_ap_payment", idField: "apPaymentId", from: ["Draft", "Received"] },
  r2r_start_year_close: { table: "r2r_fiscal_year", idField: "fiscalYearId", from: ["Open"] },
  r2r_close_fiscal_year: { table: "r2r_fiscal_year", idField: "fiscalYearId", from: ["Closing"] },
  r2r_start_period_close: { table: "r2r_fiscal_period", idField: "fiscalPeriodId", from: ["Open"] },
  r2r_close_fiscal_period: { table: "r2r_fiscal_period", idField: "fiscalPeriodId", from: ["Closing"] },
  r2r_lock_fiscal_period: { table: "r2r_fiscal_period", idField: "fiscalPeriodId", from: ["Closed"] },
  r2r_post_journal: { table: "r2r_journal", idField: "journalId", from: ["Draft"] },
  r2r_reverse_journal: { table: "r2r_journal", idField: "journalId", from: ["Posted"] },
  r2r_cancel_journal: { table: "r2r_journal", idField: "journalId", from: ["Draft"] },
  r2r_create_manual_journal: { table: "r2r_fiscal_period", idField: "fiscalPeriodId", from: ["Open"] },
  r2r_add_journal_line: { table: "r2r_journal", idField: "journalId", from: ["Draft"] },
  h2r_activate_employee: { table: "h2r_employee", idField: "employeeId", from: ["Candidate"] },
  h2r_place_on_leave: { table: "h2r_employee", idField: "employeeId", from: ["Active"] },
  h2r_return_from_leave: { table: "h2r_employee", idField: "employeeId", from: ["OnLeave"] },
  h2r_terminate_employee: { table: "h2r_employee", idField: "employeeId", from: ["Active", "OnLeave"] },
  h2r_activate_assignment: { table: "h2r_assignment", idField: "assignmentId", from: ["Planned"] },
  h2r_complete_assignment: { table: "h2r_assignment", idField: "assignmentId", from: ["Active"] },
  h2r_cancel_assignment: { table: "h2r_assignment", idField: "assignmentId", from: ["Planned"] },
  h2r_end_assignment: { table: "h2r_assignment", idField: "assignmentId", from: ["Active"] },
  h2r_expire_credential: { table: "h2r_credential", idField: "credentialId", from: ["Active"] },
  h2r_revoke_credential: { table: "h2r_credential", idField: "credentialId", from: ["Active"] },
  inv_release_reservation: { table: "inv_reservation", idField: "reservationId", from: ["Active"] },
  inv_post_cycle_count: { table: "inv_cycle_count", idField: "cycleCountId", from: ["Open", "Counted"] },
  inv_record_cycle_count_line: { table: "inv_cycle_count", idField: "cycleCountId", from: ["Open", "Counted"] },
  inv_consume_lot: { table: "inv_lot", idField: "lotId", from: ["Active"] },
  inv_consume_serial: { table: "inv_serial", idField: "serialId", from: ["Available"] },
  bom_activate_bom: { table: "inv_bom_header", idField: "bomId", from: ["Draft"] },
  bom_add_component: { table: "inv_bom_header", idField: "bomId", from: ["Draft"] },
  proj_activate_project: { table: "proj_project", idField: "projectId", from: ["Draft"] },
  proj_hold_project: { table: "proj_project", idField: "projectId", from: ["Active"] },
  proj_resume_project: { table: "proj_project", idField: "projectId", from: ["OnHold"] },
  proj_complete_project: { table: "proj_project", idField: "projectId", from: ["Active", "OnHold"] },
  proj_cancel_project: { table: "proj_project", idField: "projectId", from: ["Draft", "Active", "OnHold", "Completed"] }
};

const jsonValueSchema = {
  type: "object",
  description: "Domain service result. Result properties are entity-specific.",
  additionalProperties: true
};

function fieldSchema(field: string): z.ZodTypeAny {
  if (field === "version") {
    return z.object({
      contractValue: z.number().finite().nonnegative(),
      currencyCode: z.string().regex(/^[A-Z]{3}$/),
      effectiveFrom: z.string().date(),
      effectiveUntil: z.string().date().optional(),
      sowSnapshot: z.record(z.unknown()).optional()
    });
  }
  if (enumFields[field]) return z.enum(enumFields[field]);
  if (numberFields.has(field)) {
    let schema = z.number().finite();
    if (["amount", "budgetAmount", "countedQuantity", "hours", "quantity", "quantityOnHand", "quantityPlanned", "rate", "standardCost", "totalAmount", "unitCost", "unitPrice"].includes(field)) {
      schema = schema.nonnegative();
    }
    if (field === "quantity" || field === "hours") schema = schema.positive();
    if (field === "scrapPercentage") schema = schema.min(0).max(100);
    if (["authorityTier", "componentLineNumber", "expectedVersion", "periodNumber", "requiredTier", "versionNumber"].includes(field)) {
      schema = schema.int();
    }
    return schema;
  }
  if (booleanFields.has(field)) return z.boolean();
  if (dateFields.has(field)) return z.string().date();
  return z.string().min(1);
}

function inputSchema(name: string, requiredFields: string[]): z.ZodTypeAny {
  const fields = inputFieldsByTool[name]?.split(",") ?? [];
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const field of fields) shape[field] = fieldSchema(field).optional();
  for (const required of requiredFields) {
    if (!shape[required]) throw new Error(`MCP write contract for ${name} requires unknown field ${required}`);
    shape[required] = fieldSchema(required);
  }
  return z.object(shape).passthrough();
}

function stateGuard(name: string): McpStateGuard | undefined {
  const definition = lifecycle[name];
  if (!definition) return undefined;
  const entry = readModel.find((candidate) => candidate.table === definition.table);
  if (!entry?.primaryKey || !entry.stateColumn) {
    throw new Error(`MCP state guard for ${name} references a table without a key/state column`);
  }
  return {
    table: entry.table,
    primaryKey: entry.primaryKey,
    stateColumn: entry.stateColumn,
    idField: definition.idField,
    from: definition.from
  };
}

export function withWriteContract(definition: McpFunctionDef): McpFunctionDef & {
  zodSchema?: z.ZodTypeAny;
  stateGuard?: McpStateGuard;
} {
  if (definition.action && /^(get|list|find|describe)/.test(definition.action)) return definition;
  const fields = inputFieldsByTool[definition.name];
  const guard = stateGuard(definition.name);
  const required = [
    ...new Set([
      ...(definition.inputSchema?.required ?? requiredByTool[definition.name] ?? []),
      ...(guard ? [guard.idField] : [])
    ])
  ];
  const schema = fields === undefined
    ? z.object(Object.fromEntries(required.map((field) => [field, z.string().min(1)]))).passthrough()
    : inputSchema(definition.name, required);
  return {
    ...definition,
    zodSchema: schema,
    inputSchema: definition.inputSchema
      ? { ...definition.inputSchema, required }
      : {
        type: "object",
        required,
        properties: Object.fromEntries(
        (fields?.split(",") ?? []).map((field) => {
            if (field === "version") {
              return [field, {
                type: "object",
                required: ["contractValue", "currencyCode", "effectiveFrom"],
                properties: {
                  contractValue: { type: "number", minimum: 0 },
                  currencyCode: { type: "string", pattern: "^[A-Z]{3}$" },
                  effectiveFrom: { type: "string", format: "date" },
                  effectiveUntil: { type: "string", format: "date" },
                  sowSnapshot: { type: "object" }
                }
              }];
            }
            const type = enumFields[field] ? "string" : numberFields.has(field) ? "number" : booleanFields.has(field) ? "boolean" : "string";
          return [field, { type, ...(enumFields[field] ? { enum: enumFields[field] } : {}) }];
        })
        )
      },
    outputSchema: definition.outputSchema ?? jsonValueSchema,
    ...(guard ? { stateGuard: guard } : {})
  };
}

export const mcpWriteContractNames = Object.keys(inputFieldsByTool);
