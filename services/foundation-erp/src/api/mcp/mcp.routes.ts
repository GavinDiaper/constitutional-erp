import { Router } from "express";
import { z } from "zod";
import { mcpCatalog } from "./catalog";
import { buildRegistry, type McpToolContext } from "./registry";
import { generateReadTools } from "./readTools";
import { withWriteContract } from "./writeContracts";
import type { EventActor } from "../../events/eventStore";
import { validateBody } from "../../middleware/validate";
import { createContract, createContractAmendment, approveContractVersion } from "../../domain/o2c/contract/contractService";
import {
  createCustomer,
  activateCustomer
} from "../../domain/o2c/customer/customerService";
import {
  addQuoteLine,
  createQuote,
  sendQuote,
  acceptQuote,
  rejectQuote,
  expireQuote,
  convertQuoteToOrder
} from "../../domain/o2c/quote/quoteService";
import {
  createOrderFromQuote,
  assignOrderProject,
  confirmOrder,
  allocateOrder,
  shipOrder,
  closeOrder,
  cancelOrder
} from "../../domain/o2c/order/salesOrderService";
import {
  generateInvoice,
  postARInvoice,
  cancelARInvoice
} from "../../domain/o2c/invoice/invoiceService";
import {
  registerPayment,
  applyARPayment,
  reconcileARPayment,
  cancelARPayment
} from "../../domain/o2c/payment/paymentService";
import {
  createShipment,
  shipOrder as executeShipment,
  deliverShipment,
  cancelShipment
} from "../../domain/o2c/shipment/shipmentService";
import {
  createRequisition,
  submitRequisition,
  approveRequisition,
  rejectRequisition,
  cancelRequisition
} from "../../domain/p2p/requisition/requisitionService";
import { addRequisitionLine } from "../../domain/p2p/requisition/requisitionLineService";
import { addPurchaseOrderLine } from "../../domain/p2p/purchaseOrder/purchaseOrderLineService";
import { createSupplier, activateSupplier, suspendSupplier } from "../../domain/p2p/supplier/supplierService";
import {
  createPurchaseOrder,
  createPurchaseOrderFromRequisition,
  approvePurchaseOrder,
  sendPurchaseOrder,
  receiveGoods,
  closePurchaseOrder,
  cancelPurchaseOrder
} from "../../domain/p2p/purchaseOrder/purchaseOrderService";
import {
  createGoodsReceipt,
  updateGoodsReceiptState
} from "../../domain/p2p/receipt/goodsReceiptService";
import {
  createSupplierInvoiceFromReceipt,
  validateInvoice,
  postInvoice,
  cancelInvoice
} from "../../domain/p2p/invoice/supplierInvoiceService";
import {
  createApPayment,
  receiveApPayment,
  applyApPayment,
  reconcileApPayment,
  cancelApPayment
} from "../../domain/p2p/payment/apPaymentService";
import {
  addJournalLine,
  createJournal,
  getTrialBalance,
  postJournal,
  reverseJournal,
  cancelJournal
} from "../../domain/r2r/journal/journalService";
import { createAccount } from "../../domain/r2r/account/accountService";
import {
  createFiscalPeriod,
  createFiscalYear,
  startYearClose,
  closeFiscalYear,
  startPeriodClose,
  closePeriod,
  lockPeriod
} from "../../domain/r2r/fiscal/fiscalService";
import { createLedger } from "../../domain/r2r/ledger/ledgerService";
import {
  createEmployee,
  activateEmployee,
  placeEmployeeOnLeave,
  returnEmployeeFromLeave,
  terminateEmployee
} from "../../domain/h2r/employee/employeeService";
import { createPosition } from "../../domain/h2r/position/positionService";
import {
  createAssignment,
  activateAssignment,
  completeAssignment,
  cancelAssignment,
  endAssignment
} from "../../domain/h2r/assignment/assignmentService";
import { expireCredential, issueCredential, revokeCredential } from "../../domain/h2r/credential/credentialService";
import { createAuthorityRule } from "../../domain/h2r/authorityRule/authorityRuleService";
import {
  consumeInventoryLot,
  consumeInventorySerial,
  createCycleCount,
  createInventoryBin,
  createInventoryLot,
  createInventorySerial,
  createInventoryOrganization,
  createReservation,
  createSku,
  listCycleCounts,
  listInventoryBins,
  listInventoryLots,
  listInventoryOrganizations,
  listInventorySerials,
  listMovements,
  listOnHand,
  listReservations,
  listSkus,
  pickFromBin,
  postCycleCount,
  postInventoryMovement,
  putawayToBin,
  recordCycleCountLine,
  releaseReservation
} from "../../domain/inv/inventoryService";
import {
  activateBOMHeader,
  addBOMComponent,
  createBOMHeader,
  getBOMHeaderById,
  listBOMComponents,
  listBOMHeaders
} from "../../domain/inv/bomService";
import {
  activateProject,
  assignBomToProject,
  cancelProject,
  completeProject,
  createProject,
  createProjectFinishedItem,
  getProjectById,
  getProjectWIPSummary,
  holdProject,
  listLaborEntries,
  listProjectBomAssignments,
  listProjectFinishedItems,
  listProjects,
  postLaborCost,
  resumeProject
} from "../../domain/proj/projectService";
import { HttpError } from "../../utils/errors";
import { db } from "../../db/connection";

const invokeSchema = z.object({
  functionName: z.string().min(1),
  input: z.record(z.any()).default({})
});

type McpCatalogHandler = (input: Record<string, any>, actor: EventActor | undefined) => unknown;

const catalogHandlers: Record<string, McpCatalogHandler> = {
  o2c_create_customer: (input, actor) => createCustomer({ customerName: input.customerName, email: input.email, billingAddress: input.billingAddress, shippingAddress: input.shippingAddress }, actor),
  o2c_create_contract: (input, actor) => createContract({ customerId: input.customerId, externalReference: input.externalReference, name: input.name, version: input.version }, actor),
  o2c_amend_contract: (input, actor) => createContractAmendment(input.contractId, input.version, actor),
  o2c_approve_contract: (input, actor) => approveContractVersion(input.contractId, Number(input.versionNumber), actor),
  o2c_activate_customer: (input, actor) => activateCustomer(input.customerId, actor),
  o2c_create_quote: (input, actor) => createQuote({ customerId: input.customerId, currencyCode: input.currencyCode, legalEntityId: input.legalEntityId, projectId: input.projectId }),
  o2c_add_quote_line: (input, actor) => addQuoteLine({ quoteId: input.quoteId, sku: input.sku, quantity: Number(input.quantity), unitPrice: Number(input.unitPrice), taxTreatment: input.taxTreatment, taxCodeId: input.taxCodeId, countryCode: input.countryCode }),
  o2c_send_quote: (input, actor) => sendQuote(input.quoteId, actor),
  o2c_accept_quote: (input, actor) => acceptQuote(input.quoteId, actor),
  o2c_reject_quote: (input, actor) => rejectQuote(input.quoteId, actor),
  o2c_expire_quote: (input, actor) => expireQuote(input.quoteId, actor),
  o2c_convert_quote_to_order: (input, actor) => createOrderFromQuote(input.quoteId, input.legalEntityId, input.projectId, input.wbsId),
  o2c_assign_order_project: (input, actor) => assignOrderProject(input.orderId, input.projectId, input.wbsId, actor),
  o2c_confirm_order: (input, actor) => confirmOrder(input.orderId, actor),
  o2c_allocate_order: (input, actor) => allocateOrder(input.orderId, actor),
  o2c_ship_order: (input, actor) => shipOrder(input.orderId, actor),
  o2c_close_order: (input, actor) => closeOrder(input.orderId, actor),
  o2c_cancel_order: (input, actor) => cancelOrder(input.orderId, actor),
  o2c_generate_invoice: (input, actor) => generateInvoice(input.orderId, { taxCodeId: input.taxCodeId, countryCode: input.countryCode }),
  o2c_create_shipment: (input, actor) => createShipment(input.orderId, actor),
  o2c_execute_shipment: (input, actor) => executeShipment(input.shipmentId, { carrier: input.carrier, trackingNumber: input.trackingNumber }, actor),
  o2c_deliver_shipment: (input, actor) => deliverShipment(input.shipmentId, actor),
  o2c_cancel_shipment: (input, actor) => cancelShipment(input.shipmentId, actor),
  o2c_post_ar_invoice: (input, actor) => postARInvoice(input.invoiceId, actor),
  o2c_cancel_ar_invoice: (input, actor) => cancelARInvoice(input.invoiceId, actor),
  o2c_register_payment: (input, actor) => registerPayment({ invoiceId: input.invoiceId, amount: Number(input.amount), currencyCode: input.currencyCode, method: input.method, paymentDate: input.paymentDate }, actor),
  o2c_apply_ar_payment: (input, actor) => applyARPayment(input.paymentId, actor),
  o2c_reconcile_ar_payment: (input, actor) => reconcileARPayment(input.paymentId, actor),
  o2c_cancel_ar_payment: (input, actor) => cancelARPayment(input.paymentId, actor),
  p2p_create_requisition: (input, actor) => createRequisition({ requester: input.requester, department: input.department, currencyCode: input.currencyCode, neededByDate: input.neededByDate, legalEntityId: input.legalEntityId }, actor),
  p2p_submit_requisition: (input, actor) => submitRequisition(input.requisitionId, actor),
  p2p_approve_requisition: (input, actor) => approveRequisition(input.requisitionId, actor),
  p2p_reject_requisition: (input, actor) => rejectRequisition(input.requisitionId, actor),
  p2p_add_requisition_line: (input, actor) => addRequisitionLine({ requisitionId: input.requisitionId, description: input.description, quantity: Number(input.quantity), unitPrice: Number(input.unitPrice), taxCodeId: input.taxCodeId, countryCode: input.countryCode }, actor),
  p2p_add_po_line: (input, actor) => addPurchaseOrderLine({ poId: input.poId, description: input.description, quantity: Number(input.quantity), unitPrice: Number(input.unitPrice) }, actor),
  p2p_cancel_requisition: (input, actor) => cancelRequisition(input.requisitionId, actor),
  p2p_convert_requisition_to_po: (input, actor) => createPurchaseOrderFromRequisition({ requisitionId: input.requisitionId, supplierId: input.supplierId, legalEntityId: input.legalEntityId }, actor),
  p2p_create_supplier: (input, actor) => createSupplier({ supplierName: input.supplierName, email: input.email, paymentTerms: input.paymentTerms, taxId: input.taxId, currencyCode: input.currencyCode }, actor),
  p2p_activate_supplier: (input, actor) => activateSupplier(input.supplierId, actor),
  p2p_suspend_supplier: (input, actor) => suspendSupplier(input.supplierId, actor),
  p2p_create_po: (input, actor) => createPurchaseOrder({ supplierId: input.supplierId, requisitionId: input.requisitionId, totalAmount: input.totalAmount, currencyCode: input.currencyCode, deliveryAddress: input.deliveryAddress, legalEntityId: input.legalEntityId }, actor),
  p2p_approve_po: (input, actor) => approvePurchaseOrder(input.poId, actor),
  p2p_send_po: (input, actor) => sendPurchaseOrder(input.poId, actor),
  p2p_receive_goods_on_po: (input, actor) => receiveGoods(input.poId, input.isPartial ?? false, actor),
  p2p_close_po: (input, actor) => closePurchaseOrder(input.poId, actor),
  p2p_cancel_po: (input, actor) => cancelPurchaseOrder(input.poId, actor),
  p2p_create_goods_receipt: (input, actor) => createGoodsReceipt(input.poId),
  p2p_goods_receipt_receive: (input, actor) => updateGoodsReceiptState(input.receiptId, "Received"),
  p2p_goods_receipt_accept: (input, actor) => updateGoodsReceiptState(input.receiptId, "Accepted", { isPartial: input.isPartial }),
  p2p_create_supplier_invoice: (input, actor) => createSupplierInvoiceFromReceipt(input.receiptId, { invoiceDate: input.invoiceDate, dueDate: input.dueDate, currencyCode: input.currencyCode }),
  p2p_validate_invoice: (input, actor) => validateInvoice(input.supplierInvoiceId, actor),
  p2p_post_supplier_invoice: (input, actor) => postInvoice(input.supplierInvoiceId, actor),
  p2p_cancel_invoice: (input, actor) => cancelInvoice(input.supplierInvoiceId, actor),
  p2p_create_ap_payment: (input, actor) => createApPayment({ supplierInvoiceId: input.supplierInvoiceId, amount: Number(input.amount), currencyCode: input.currencyCode, method: input.method }, actor),
  p2p_receive_ap_payment: (input, actor) => receiveApPayment(input.apPaymentId, actor),
  p2p_apply_ap_payment: (input, actor) => applyApPayment(input.apPaymentId, actor),
  p2p_reconcile_ap_payment: (input, actor) => reconcileApPayment(input.apPaymentId, actor),
  p2p_cancel_ap_payment: (input, actor) => cancelApPayment(input.apPaymentId, actor),
  r2r_create_ledger: (input, actor) => createLedger({ name: input.name, currencyCode: input.currencyCode, calendar: input.calendar, chartOfAccountsRef: input.chartOfAccountsRef }, actor),
  r2r_create_account: (input, actor) => createAccount({ accountCode: input.accountCode, accountName: input.accountName, accountType: input.accountType }),
  r2r_create_fiscal_year: (input, actor) => createFiscalYear({ yearLabel: input.yearLabel, startDate: input.startDate, endDate: input.endDate }, actor),
  r2r_start_year_close: (input, actor) => startYearClose(input.fiscalYearId, actor),
  r2r_close_fiscal_year: (input, actor) => closeFiscalYear(input.fiscalYearId, actor),
  r2r_create_fiscal_period: (input, actor) => createFiscalPeriod({ fiscalYearId: input.fiscalYearId, periodNumber: Number(input.periodNumber), startDate: input.startDate, endDate: input.endDate }, actor),
  r2r_start_period_close: (input, actor) => startPeriodClose(input.fiscalPeriodId, actor),
  r2r_close_fiscal_period: (input, actor) => closePeriod(input.fiscalPeriodId, actor),
  r2r_lock_fiscal_period: (input, actor) => lockPeriod(input.fiscalPeriodId, actor),
  r2r_create_manual_journal: (input, actor) => createJournal({ fiscalPeriodId: input.fiscalPeriodId, description: input.description }),
  r2r_add_journal_line: (input, actor) => addJournalLine({ journalId: input.journalId, accountId: input.accountId, debitAmount: Number(input.debitAmount ?? 0), creditAmount: Number(input.creditAmount ?? 0), memo: input.memo }),
  r2r_post_journal: (input, actor) => postJournal(input.journalId, actor),
  r2r_reverse_journal: (input, actor) => reverseJournal(input.journalId, actor),
  r2r_cancel_journal: (input, actor) => cancelJournal(input.journalId, actor),
  r2r_get_trial_balance: (input, actor) => getTrialBalance(input.fiscalPeriodId),
  h2r_create_employee: (input, actor) => createEmployee( { name: input.name, email: input.email, active: typeof input.active === "boolean" ? input.active : undefined, status: input.status === "Candidate" || input.status === "Active" ? input.status : undefined }, actor ),
  h2r_activate_employee: (input, actor) => activateEmployee(input.employeeId, actor),
  h2r_place_on_leave: (input, actor) => placeEmployeeOnLeave(input.employeeId, actor),
  h2r_return_from_leave: (input, actor) => returnEmployeeFromLeave(input.employeeId, actor),
  h2r_terminate_employee: (input, actor) => terminateEmployee(input.employeeId, actor),
  h2r_create_position: (input, actor) => createPosition({ title: input.title, department: input.department, authorityDomain: input.authorityDomain, authorityTier: Number(input.authorityTier) }, actor),
  h2r_create_assignment: (input, actor) => createAssignment({ employeeId: input.employeeId, positionId: input.positionId, startDate: input.startDate, endDate: input.endDate, department: input.department, role: input.role }, actor),
  h2r_activate_assignment: (input, actor) => activateAssignment(input.assignmentId, actor),
  h2r_complete_assignment: (input, actor) => completeAssignment(input.assignmentId, actor),
  h2r_cancel_assignment: (input, actor) => cancelAssignment(input.assignmentId, actor),
  h2r_end_assignment: (input, actor) => endAssignment(input.assignmentId, actor),
  h2r_issue_credential: (input, actor) => issueCredential({ employeeId: input.employeeId, type: input.type, expiryDate: input.expiryDate }, actor),
  h2r_expire_credential: (input, actor) => expireCredential(input.credentialId, actor),
  h2r_revoke_credential: (input, actor) => revokeCredential(input.credentialId, actor),
  h2r_create_authority_rule: (input, actor) => createAuthorityRule({ domain: input.domain, threshold: Number(input.threshold), requiredTier: Number(input.requiredTier) }, actor),
  inv_create_sku: (input, actor) => createSku({ skuCode: input.skuCode, description: input.description, category: input.category, uom: input.uom, skuType: input.skuType, valuationMethod: input.valuationMethod, standardCost: input.standardCost !== undefined ? Number(input.standardCost) : undefined }, actor),
  inv_list_skus: (input, actor) => listSkus(),
  inv_create_organization: (input, actor) => createInventoryOrganization({ name: input.name, ledgerId: input.ledgerId, inventoryAssetAccountCode: input.inventoryAssetAccountCode, cogsAccountCode: input.cogsAccountCode }, actor),
  inv_list_organizations: (input, actor) => listInventoryOrganizations(),
  inv_post_movement: (input, actor) => postInventoryMovement({ skuId: input.skuId, organizationId: input.organizationId, movementType: input.movementType, quantity: Number(input.quantity), unitCost: input.unitCost !== undefined ? Number(input.unitCost) : undefined, reason: input.reason, referenceType: input.referenceType, referenceId: input.referenceId, correlationKey: input.correlationKey, projectId: input.projectId, projectWipId: input.projectWipId, bomId: input.bomId, bomComponentFlag: input.bomComponentFlag, isProjectFinishedGood: input.isProjectFinishedGood }, actor),
  inv_list_movements: (input, actor) => listMovements(),
  inv_list_on_hand: (input, actor) => listOnHand({ skuId: input.skuId, organizationId: input.organizationId }),
  inv_create_reservation: (input, actor) => createReservation({ skuId: input.skuId, organizationId: input.organizationId, reservationType: input.reservationType, quantity: Number(input.quantity), referenceType: input.referenceType, referenceId: input.referenceId, reason: input.reason, correlationKey: input.correlationKey, expiresAt: input.expiresAt }, actor),
  inv_list_reservations: (input, actor) => listReservations({ skuId: input.skuId, organizationId: input.organizationId, status: input.status, reservationType: input.reservationType }),
  inv_release_reservation: (input, actor) => releaseReservation( input.reservationId, { reason: input.reason, expectedVersion: input.expectedVersion !== undefined ? Number(input.expectedVersion) : undefined }, actor ),
  inv_create_bin: (input, actor) => createInventoryBin({ organizationId: input.organizationId, binCode: input.binCode, zone: input.zone, aisle: input.aisle, rack: input.rack, shelfLevel: input.shelfLevel }, actor),
  inv_list_bins: (input, actor) => listInventoryBins({ organizationId: input.organizationId, isActive: input.isActive }),
  inv_putaway_to_bin: (input, actor) => putawayToBin({ skuId: input.skuId, organizationId: input.organizationId, binId: input.binId, quantity: Number(input.quantity), reason: input.reason, referenceType: input.referenceType, referenceId: input.referenceId, correlationKey: input.correlationKey }, actor),
  inv_pick_from_bin: (input, actor) => pickFromBin({ skuId: input.skuId, organizationId: input.organizationId, binId: input.binId, quantity: Number(input.quantity), reason: input.reason, referenceType: input.referenceType, referenceId: input.referenceId, correlationKey: input.correlationKey }, actor),
  inv_create_cycle_count: (input, actor) => createCycleCount({ organizationId: input.organizationId, binId: input.binId, reason: input.reason, scheduledFor: input.scheduledFor }, actor),
  inv_list_cycle_counts: (input, actor) => listCycleCounts({ organizationId: input.organizationId, binId: input.binId, status: input.status }),
  inv_record_cycle_count_line: (input, actor) => recordCycleCountLine({ cycleCountId: input.cycleCountId, skuId: input.skuId, countedQuantity: Number(input.countedQuantity), reason: input.reason }, actor),
  inv_post_cycle_count: (input, actor) => postCycleCount(input.cycleCountId, actor),
  inv_create_lot: (input, actor) => createInventoryLot({ skuId: input.skuId, organizationId: input.organizationId, lotCode: input.lotCode, quantityOnHand: Number(input.quantityOnHand), manufactureDate: input.manufactureDate, expiryDate: input.expiryDate }, actor),
  inv_list_lots: (input, actor) => listInventoryLots({ skuId: input.skuId, organizationId: input.organizationId, status: input.status }),
  inv_consume_lot: (input, actor) => consumeInventoryLot(input.lotId, { quantity: Number(input.quantity), reason: input.reason }, actor),
  inv_create_serial: (input, actor) => createInventorySerial({ skuId: input.skuId, organizationId: input.organizationId, serialNumber: input.serialNumber, lotId: input.lotId }, actor),
  inv_list_serials: (input, actor) => listInventorySerials({ skuId: input.skuId, organizationId: input.organizationId, lotId: input.lotId, status: input.status }),
  inv_consume_serial: (input, actor) => consumeInventorySerial(input.serialId, { reason: input.reason }, actor),
  inv_issue_to_project: (input, actor) => postInventoryMovement({ skuId: input.skuId, organizationId: input.organizationId, movementType: "issue", quantity: Number(input.quantity), unitCost: input.unitCost !== undefined ? Number(input.unitCost) : undefined, reason: input.reason ?? "Issue to project", referenceType: input.assignmentId ? "bom_assignment" : undefined, referenceId: input.assignmentId, projectId: input.projectId, bomId: input.bomId, bomComponentFlag: Boolean(input.bomId) }, actor),
  bom_create_bom: (input, actor) => createBOMHeader({ skuId: input.skuId, organizationId: input.organizationId, revision: input.revision, description: input.description, projectEligible: input.projectEligible, costingProfile: input.costingProfile, effectiveDate: input.effectiveDate, endDate: input.endDate }, actor),
  bom_list_boms: (input, actor) => listBOMHeaders( input.organizationId, input.limit !== undefined ? Number(input.limit) : undefined, input.offset !== undefined ? Number(input.offset) : undefined ),
  bom_get_bom: (input, actor) => getBOMHeaderById(input.bomId),
  bom_add_component: (input, actor) => addBOMComponent({ bomId: input.bomId, componentSkuId: input.componentSkuId, componentLineNumber: input.componentLineNumber !== undefined ? Number(input.componentLineNumber) : undefined, componentDescription: input.componentDescription, quantity: Number(input.quantity), quantityUom: input.quantityUom, scrapPercentage: input.scrapPercentage !== undefined ? Number(input.scrapPercentage) : undefined, isPhantom: input.isPhantom, standardCost: input.standardCost !== undefined ? Number(input.standardCost) : undefined, costElementId: input.costElementId }, actor),
  bom_list_components: (input, actor) => listBOMComponents(input.bomId),
  bom_activate_bom: (input, actor) => activateBOMHeader(input.bomId, actor),
  proj_create_project: (input, actor) => createProject({ projectId: input.projectId, name: input.name, description: input.description, projectType: input.projectType, customerId: input.customerId, contractId: input.contractId, wbsId: input.wbsId, budgetAmount: Number(input.budgetAmount), defaultWIPAccountId: input.defaultWIPAccountId, defaultCloseAccountId: input.defaultCloseAccountId, startDate: input.startDate, endDate: input.endDate, projectManagerId: input.projectManagerId, organizationId: input.organizationId }, actor),
  proj_list_projects: (input, actor) => listProjects( input.limit !== undefined ? Number(input.limit) : undefined, input.offset !== undefined ? Number(input.offset) : undefined ),
  proj_get_project: (input, actor) => getProjectById(input.projectId),
  proj_activate_project: (input, actor) => activateProject(input.projectId, actor),
  proj_hold_project: (input, actor) => holdProject(input.projectId, input.holdReason, actor),
  proj_resume_project: (input, actor) => resumeProject(input.projectId, actor),
  proj_complete_project: (input, actor) => completeProject(input.projectId, input.completionType, input.closeAccountId, actor),
  proj_cancel_project: (input, actor) => cancelProject(input.projectId, input.cancellationReason, input.forceCancel, actor),
  proj_get_wip_summary: (input, actor) => getProjectWIPSummary(input.projectId),
  proj_assign_bom: (input, actor) => assignBomToProject({ projectId: input.projectId, bomId: input.bomId, wbsId: input.wbsId, quantityPlanned: Number(input.quantityPlanned) }, actor),
  proj_list_bom_assignments: (input, actor) => listProjectBomAssignments(input.projectId),
  proj_post_labor_cost: (input, actor) => postLaborCost({ projectId: input.projectId, wbsId: input.wbsId, resourceId: input.resourceId, hours: Number(input.hours), rate: Number(input.rate), costElementId: input.costElementId }, actor),
  proj_list_labor_entries: (input, actor) => listLaborEntries(input.projectId),
  proj_create_finished_item: (input, actor) => createProjectFinishedItem({ projectId: input.projectId, skuId: input.skuId, organizationId: input.organizationId, quantity: Number(input.quantity), unitCost: input.unitCost !== undefined ? Number(input.unitCost) : undefined }, actor),
  proj_list_finished_items: (input, actor) => listProjectFinishedItems(input.projectId)
};

function invokeCatalogHandler(functionName: string, input: Record<string, any>, actor: EventActor | undefined): unknown {
  const handler = catalogHandlers[functionName];
  if (!handler) {
    throw new HttpError(404, "function_not_found", `Unknown MCP function: ${functionName}`);
  }
  return handler(input, actor);
}

export const mcpRegistry = buildRegistry([
  ...mcpCatalog.map((definition) => ({
    ...withWriteContract(definition),
    handler: (input: Record<string, any>, ctx: McpToolContext) => invokeCatalogHandler(definition.name, input, ctx.actor)
  })),
  ...generateReadTools(mcpCatalog.map((fn) => fn.name))
]);

export const mcpRouter = Router();

mcpRouter.get("/functions", (req, res) => {
  const { domain, entity, kind } = req.query;
  res.json({
    data: mcpRegistry.describe({
      domain: typeof domain === "string" ? domain : undefined,
      entity: typeof entity === "string" ? entity : undefined,
      kind: kind === "read" || kind === "write" ? kind : undefined
    })
  });
});

mcpRouter.post("/invoke", validateBody(invokeSchema), async (req, res, next) => {
  try {
    const { functionName, input } = req.body as { functionName: string; input: Record<string, any> };
    const tool = mcpRegistry.get(functionName);
    if (!tool) {
      throw new HttpError(404, "function_not_found", `Unknown MCP function: ${functionName}`);
    }

    let validated = input;
    if (tool.zodSchema) {
      const parsed = tool.zodSchema.safeParse(input);
      if (!parsed.success) {
        throw new HttpError(400, "invalid_input", parsed.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; "));
      }
      validated = parsed.data as Record<string, any>;
    }

    if (tool.stateGuard) {
      const { table, primaryKey, stateColumn, idField, from } = tool.stateGuard;
      const id = validated[idField];
      const record = db.prepare(
        `SELECT "${stateColumn}" AS state FROM "${table}" WHERE "${primaryKey}" = ?`
      ).get(id) as { state?: string } | undefined;
      if (!record) {
        throw new HttpError(404, "entity_not_found", `${table} record ${String(id)} was not found`);
      }
      if (!record.state || !from.includes(record.state)) {
        throw new HttpError(409, "invalid_entity_state", `${table} record ${String(id)} is in state ${record.state ?? "unknown"}; allowed state(s): ${from.join(", ")}`);
      }
    }

    const result = await tool.handler(validated, { actor: req.actor });
    res.json({ functionName, result });
  } catch (error) {
    next(error);
  }
});
