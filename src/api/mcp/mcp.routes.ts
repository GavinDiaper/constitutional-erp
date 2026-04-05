import { Router } from "express";
import { z } from "zod";
import { mcpCatalog } from "./catalog";
import { validateBody } from "../../middleware/validate";
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
import { HttpError } from "../../utils/errors";

const invokeSchema = z.object({
  functionName: z.string().min(1),
  input: z.record(z.any()).default({})
});

export const mcpRouter = Router();

mcpRouter.get("/functions", (_req, res) => {
  res.json({ data: mcpCatalog });
});

mcpRouter.post("/invoke", validateBody(invokeSchema), (req, res, next) => {
  try {
    const { functionName, input } = req.body as { functionName: string; input: Record<string, any> };
    const actor = req.actor;

    let result: unknown;

    switch (functionName) {
      // ── O2C ─────────────────────────────────────────────────────────────────
      case "o2c_create_customer":
        result = createCustomer({
          customerName: input.customerName,
          email: input.email,
          billingAddress: input.billingAddress,
          shippingAddress: input.shippingAddress
        }, actor);
        break;
      case "o2c_activate_customer":
        result = activateCustomer(input.customerId, actor);
        break;
      case "o2c_create_quote":
        result = createQuote({ customerId: input.customerId, currencyCode: input.currencyCode, legalEntityId: input.legalEntityId });
        break;
      case "o2c_add_quote_line":
        result = addQuoteLine({
          quoteId: input.quoteId,
          sku: input.sku,
          quantity: Number(input.quantity),
          unitPrice: Number(input.unitPrice)
        });
        break;
      case "o2c_send_quote":
        result = sendQuote(input.quoteId, actor);
        break;
      case "o2c_accept_quote":
        result = acceptQuote(input.quoteId, actor);
        break;
      case "o2c_reject_quote":
        result = rejectQuote(input.quoteId, actor);
        break;
      case "o2c_expire_quote":
        result = expireQuote(input.quoteId, actor);
        break;
      case "o2c_convert_quote_to_order":
        result = createOrderFromQuote(input.quoteId, input.legalEntityId);
        break;
      case "o2c_confirm_order":
        result = confirmOrder(input.orderId, actor);
        break;
      case "o2c_allocate_order":
        result = allocateOrder(input.orderId, actor);
        break;
      case "o2c_ship_order":
        result = shipOrder(input.orderId, actor);
        break;
      case "o2c_close_order":
        result = closeOrder(input.orderId, actor);
        break;
      case "o2c_cancel_order":
        result = cancelOrder(input.orderId, actor);
        break;
      case "o2c_generate_invoice":
        result = generateInvoice(input.orderId);
        break;
      case "o2c_create_shipment":
        result = createShipment(input.orderId, actor);
        break;
      case "o2c_execute_shipment":
        result = executeShipment(input.shipmentId, { carrier: input.carrier, trackingNumber: input.trackingNumber }, actor);
        break;
      case "o2c_deliver_shipment":
        result = deliverShipment(input.shipmentId, actor);
        break;
      case "o2c_cancel_shipment":
        result = cancelShipment(input.shipmentId, actor);
        break;
      case "o2c_post_ar_invoice":
        result = postARInvoice(input.invoiceId, actor);
        break;
      case "o2c_cancel_ar_invoice":
        result = cancelARInvoice(input.invoiceId, actor);
        break;
      case "o2c_register_payment":
        result = registerPayment({
          invoiceId: input.invoiceId,
          amount: Number(input.amount),
          currencyCode: input.currencyCode,
          method: input.method,
          paymentDate: input.paymentDate
        }, actor);
        break;
      case "o2c_apply_ar_payment":
        result = applyARPayment(input.paymentId, actor);
        break;
      case "o2c_reconcile_ar_payment":
        result = reconcileARPayment(input.paymentId, actor);
        break;
      case "o2c_cancel_ar_payment":
        result = cancelARPayment(input.paymentId, actor);
        break;

      // ── P2P ─────────────────────────────────────────────────────────────────
      case "p2p_create_requisition":
        result = createRequisition({
          requester: input.requester,
          department: input.department,
          currencyCode: input.currencyCode,
          neededByDate: input.neededByDate,
          legalEntityId: input.legalEntityId
        }, actor);
        break;
      case "p2p_submit_requisition":
        result = submitRequisition(input.requisitionId, actor);
        break;
      case "p2p_approve_requisition":
        result = approveRequisition(input.requisitionId, actor);
        break;
      case "p2p_reject_requisition":
        result = rejectRequisition(input.requisitionId, actor);
        break;
      case "p2p_cancel_requisition":
        result = cancelRequisition(input.requisitionId, actor);
        break;
      case "p2p_convert_requisition_to_po":
        result = createPurchaseOrderFromRequisition({
          requisitionId: input.requisitionId,
          supplierId: input.supplierId,
          legalEntityId: input.legalEntityId
        }, actor);
        break;
      case "p2p_create_supplier":
        result = createSupplier({
          supplierName: input.supplierName,
          email: input.email,
          paymentTerms: input.paymentTerms,
          taxId: input.taxId,
          currencyCode: input.currencyCode
        }, actor);
        break;
      case "p2p_activate_supplier":
        result = activateSupplier(input.supplierId, actor);
        break;
      case "p2p_suspend_supplier":
        result = suspendSupplier(input.supplierId, actor);
        break;
      case "p2p_create_po":
        result = createPurchaseOrder({
          supplierId: input.supplierId,
          requisitionId: input.requisitionId,
          totalAmount: input.totalAmount,
          currencyCode: input.currencyCode,
          deliveryAddress: input.deliveryAddress,
          legalEntityId: input.legalEntityId
        }, actor);
        break;
      case "p2p_approve_po":
        result = approvePurchaseOrder(input.poId, actor);
        break;
      case "p2p_send_po":
        result = sendPurchaseOrder(input.poId, actor);
        break;
      case "p2p_receive_goods_on_po":
        result = receiveGoods(input.poId, input.isPartial ?? false, actor);
        break;
      case "p2p_close_po":
        result = closePurchaseOrder(input.poId, actor);
        break;
      case "p2p_cancel_po":
        result = cancelPurchaseOrder(input.poId, actor);
        break;
      case "p2p_create_goods_receipt":
        result = createGoodsReceipt(input.poId);
        break;
      case "p2p_goods_receipt_receive":
        result = updateGoodsReceiptState(input.receiptId, "Received");
        break;
      case "p2p_goods_receipt_accept":
        result = updateGoodsReceiptState(input.receiptId, "Accepted", { isPartial: input.isPartial });
        break;
      case "p2p_create_supplier_invoice":
        result = createSupplierInvoiceFromReceipt(input.receiptId, {
          invoiceDate: input.invoiceDate,
          dueDate: input.dueDate,
          currencyCode: input.currencyCode
        });
        break;
      case "p2p_validate_invoice":
        result = validateInvoice(input.supplierInvoiceId, actor);
        break;
      case "p2p_post_supplier_invoice":
        result = postInvoice(input.supplierInvoiceId, actor);
        break;
      case "p2p_cancel_invoice":
        result = cancelInvoice(input.supplierInvoiceId, actor);
        break;
      case "p2p_create_ap_payment":
        result = createApPayment({
          supplierInvoiceId: input.supplierInvoiceId,
          amount: Number(input.amount),
          currencyCode: input.currencyCode,
          method: input.method
        }, actor);
        break;
      case "p2p_receive_ap_payment":
        result = receiveApPayment(input.apPaymentId, actor);
        break;
      case "p2p_apply_ap_payment":
        result = applyApPayment(input.apPaymentId, actor);
        break;
      case "p2p_reconcile_ap_payment":
        result = reconcileApPayment(input.apPaymentId, actor);
        break;
      case "p2p_cancel_ap_payment":
        result = cancelApPayment(input.apPaymentId, actor);
        break;

      // ── R2R ─────────────────────────────────────────────────────────────────
      case "r2r_create_ledger":
        result = createLedger({
          name: input.name,
          currencyCode: input.currencyCode,
          calendar: input.calendar,
          chartOfAccountsRef: input.chartOfAccountsRef
        }, actor);
        break;
      case "r2r_create_account":
        result = createAccount({
          accountCode: input.accountCode,
          accountName: input.accountName,
          accountType: input.accountType
        });
        break;
      case "r2r_create_fiscal_year":
        result = createFiscalYear({
          yearLabel: input.yearLabel,
          startDate: input.startDate,
          endDate: input.endDate
        }, actor);
        break;
      case "r2r_start_year_close":
        result = startYearClose(input.fiscalYearId, actor);
        break;
      case "r2r_close_fiscal_year":
        result = closeFiscalYear(input.fiscalYearId, actor);
        break;
      case "r2r_create_fiscal_period":
        result = createFiscalPeriod({
          fiscalYearId: input.fiscalYearId,
          periodNumber: Number(input.periodNumber),
          startDate: input.startDate,
          endDate: input.endDate
        }, actor);
        break;
      case "r2r_start_period_close":
        result = startPeriodClose(input.fiscalPeriodId, actor);
        break;
      case "r2r_close_fiscal_period":
        result = closePeriod(input.fiscalPeriodId, actor);
        break;
      case "r2r_lock_fiscal_period":
        result = lockPeriod(input.fiscalPeriodId, actor);
        break;
      case "r2r_create_manual_journal":
        result = createJournal({
          fiscalPeriodId: input.fiscalPeriodId,
          description: input.description
        });
        break;
      case "r2r_add_journal_line":
        result = addJournalLine({
          journalId: input.journalId,
          accountId: input.accountId,
          debitAmount: Number(input.debitAmount ?? 0),
          creditAmount: Number(input.creditAmount ?? 0),
          memo: input.memo
        });
        break;
      case "r2r_post_journal":
        result = postJournal(input.journalId, actor);
        break;
      case "r2r_reverse_journal":
        result = reverseJournal(input.journalId, actor);
        break;
      case "r2r_cancel_journal":
        result = cancelJournal(input.journalId, actor);
        break;
      case "r2r_get_trial_balance":
        result = getTrialBalance(input.fiscalPeriodId);
        break;

      // ── H2R ─────────────────────────────────────────────────────────────────
      case "h2r_create_employee":
        result = createEmployee(
          {
            name: input.name,
            email: input.email,
            active: typeof input.active === "boolean" ? input.active : undefined,
            status: input.status === "Candidate" || input.status === "Active" ? input.status : undefined
          },
          actor
        );
        break;
      case "h2r_activate_employee":
        result = activateEmployee(input.employeeId, actor);
        break;
      case "h2r_place_on_leave":
        result = placeEmployeeOnLeave(input.employeeId, actor);
        break;
      case "h2r_return_from_leave":
        result = returnEmployeeFromLeave(input.employeeId, actor);
        break;
      case "h2r_terminate_employee":
        result = terminateEmployee(input.employeeId, actor);
        break;
      case "h2r_create_position":
        result = createPosition({
          title: input.title,
          department: input.department,
          authorityDomain: input.authorityDomain,
          authorityTier: Number(input.authorityTier)
        }, actor);
        break;
      case "h2r_create_assignment":
        result = createAssignment({
          employeeId: input.employeeId,
          positionId: input.positionId,
          startDate: input.startDate,
          endDate: input.endDate,
          department: input.department,
          role: input.role
        }, actor);
        break;
      case "h2r_activate_assignment":
        result = activateAssignment(input.assignmentId, actor);
        break;
      case "h2r_complete_assignment":
        result = completeAssignment(input.assignmentId, actor);
        break;
      case "h2r_cancel_assignment":
        result = cancelAssignment(input.assignmentId, actor);
        break;
      case "h2r_end_assignment":
        result = endAssignment(input.assignmentId, actor);
        break;
      case "h2r_issue_credential":
        result = issueCredential({ employeeId: input.employeeId, type: input.type, expiryDate: input.expiryDate }, actor);
        break;
      case "h2r_expire_credential":
        result = expireCredential(input.credentialId, actor);
        break;
      case "h2r_revoke_credential":
        result = revokeCredential(input.credentialId, actor);
        break;
      case "h2r_create_authority_rule":
        result = createAuthorityRule({
          domain: input.domain,
          threshold: Number(input.threshold),
          requiredTier: Number(input.requiredTier)
        }, actor);
        break;

      default:
        throw new HttpError(404, "function_not_found", `Unknown MCP function: ${functionName}`);
    }

    res.json({ functionName, result });
  } catch (error) {
    next(error);
  }
});
