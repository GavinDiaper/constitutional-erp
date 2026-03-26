import { Router } from "express";
import { z } from "zod";
import { mcpCatalog } from "./catalog";
import { validateBody } from "../../middleware/validate";
import { addQuoteLine, createQuote, updateQuoteState } from "../../domain/o2c/quote/quoteService";
import { createOrderFromQuote, updateOrderState } from "../../domain/o2c/order/salesOrderService";
import { generateInvoice, updateInvoiceState } from "../../domain/o2c/invoice/invoiceService";
import { registerPayment, updatePaymentState } from "../../domain/o2c/payment/paymentService";
import { createRequisition, updateRequisitionState } from "../../domain/p2p/requisition/requisitionService";
import { createSupplier } from "../../domain/p2p/supplier/supplierService";
import {
  createPurchaseOrder,
  createPurchaseOrderFromRequisition,
  updatePurchaseOrderState
} from "../../domain/p2p/purchaseOrder/purchaseOrderService";
import {
  createGoodsReceipt,
  updateGoodsReceiptState
} from "../../domain/p2p/receipt/goodsReceiptService";
import {
  createSupplierInvoiceFromReceipt,
  updateSupplierInvoiceState
} from "../../domain/p2p/invoice/supplierInvoiceService";
import { createApPayment, updateApPaymentState } from "../../domain/p2p/payment/apPaymentService";
import { addJournalLine, createJournal, getTrialBalance, updateJournalState } from "../../domain/r2r/journal/journalService";
import { createAccount } from "../../domain/r2r/account/accountService";
import {
  createFiscalPeriod,
  createFiscalYear,
  updateFiscalPeriodState,
  updateFiscalYearState
} from "../../domain/r2r/fiscal/fiscalService";
import {
  createEmployee,
  placeEmployeeOnLeave,
  returnEmployeeFromLeave,
  terminateEmployee
} from "../../domain/h2r/employee/employeeService";
import { createPosition } from "../../domain/h2r/position/positionService";
import { createAssignment, endAssignment } from "../../domain/h2r/assignment/assignmentService";
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

    let result: unknown;

    switch (functionName) {
      case "o2c_create_quote":
        result = createQuote({ customerId: input.customerId, currencyCode: input.currencyCode });
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
        result = updateQuoteState(input.quoteId, "Sent");
        break;
      case "o2c_accept_quote":
        result = updateQuoteState(input.quoteId, "Accepted");
        break;
      case "o2c_convert_quote_to_order":
        result = createOrderFromQuote(input.quoteId);
        break;
      case "o2c_confirm_order":
        result = updateOrderState(input.orderId, "Confirmed");
        break;
      case "o2c_allocate_stock":
        result = updateOrderState(input.orderId, "Allocated");
        break;
      case "o2c_ship_order":
        result = updateOrderState(input.orderId, "Shipped");
        break;
      case "o2c_generate_invoice":
        result = generateInvoice(input.orderId);
        break;
      case "o2c_post_invoice":
        result = updateInvoiceState(input.invoiceId, "Posted");
        break;
      case "o2c_register_payment":
        result = registerPayment({ invoiceId: input.invoiceId, amount: Number(input.amount) });
        break;
      case "o2c_apply_payment_to_invoice":
        result = updatePaymentState(input.paymentId, "Applied");
        break;
      case "p2p_create_requisition":
        result = createRequisition(input.requester);
        break;
      case "p2p_submit_requisition":
        result = updateRequisitionState(input.requisitionId, "Submitted");
        break;
      case "p2p_approve_requisition":
        result = updateRequisitionState(input.requisitionId, "Approved");
        break;
      case "p2p_convert_requisition_to_po":
        result = createPurchaseOrderFromRequisition({
          requisitionId: input.requisitionId,
          supplierId: input.supplierId
        });
        break;
      case "p2p_create_supplier":
        result = createSupplier({ supplierName: input.supplierName, email: input.email });
        break;
      case "p2p_create_po":
        result = createPurchaseOrder({
          supplierId: input.supplierId,
          requisitionId: input.requisitionId,
          totalAmount: input.totalAmount
        });
        break;
      case "p2p_issue_po":
        result = updatePurchaseOrderState(input.poId, "Issued");
        break;
      case "p2p_acknowledge_po":
        result = updatePurchaseOrderState(input.poId, "Acknowledged");
        break;
      case "p2p_create_goods_receipt":
        result = createGoodsReceipt(input.poId);
        break;
      case "p2p_receive_goods":
        result = updateGoodsReceiptState(input.receiptId, "Received");
        break;
      case "p2p_accept_goods":
        result = updateGoodsReceiptState(input.receiptId, "Accepted");
        break;
      case "p2p_create_supplier_invoice":
        result = createSupplierInvoiceFromReceipt(input.receiptId);
        break;
      case "p2p_post_supplier_invoice":
        result = updateSupplierInvoiceState(input.supplierInvoiceId, "Posted");
        break;
      case "p2p_create_ap_payment":
        result = createApPayment({ supplierInvoiceId: input.supplierInvoiceId, amount: Number(input.amount) });
        break;
      case "p2p_execute_ap_payment":
        result = updateApPaymentState(input.apPaymentId, "Executed");
        break;
      case "p2p_reconcile_ap_payment":
        result = updateApPaymentState(input.apPaymentId, "Reconciled");
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
        });
        break;
      case "r2r_close_fiscal_year":
        result = updateFiscalYearState(input.fiscalYearId, "Closed");
        break;
      case "r2r_create_fiscal_period":
        result = createFiscalPeriod({
          fiscalYearId: input.fiscalYearId,
          periodNumber: Number(input.periodNumber),
          startDate: input.startDate,
          endDate: input.endDate
        });
        break;
      case "r2r_close_fiscal_period":
        result = updateFiscalPeriodState(input.fiscalPeriodId, "Closed");
        break;
      case "r2r_lock_fiscal_period":
        result = updateFiscalPeriodState(input.fiscalPeriodId, "Locked");
        break;
      case "r2r_create_manual_journal":
        result = createJournal({ fiscalPeriodId: input.fiscalPeriodId, description: input.description });
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
        result = updateJournalState(input.journalId, "Posted");
        break;
      case "r2r_get_trial_balance":
        result = getTrialBalance(input.fiscalPeriodId);
        break;
      case "h2r_create_employee":
        result = createEmployee({ name: input.name, email: input.email });
        break;
      case "h2r_place_on_leave":
        result = placeEmployeeOnLeave(input.employeeId);
        break;
      case "h2r_return_from_leave":
        result = returnEmployeeFromLeave(input.employeeId);
        break;
      case "h2r_terminate_employee":
        result = terminateEmployee(input.employeeId);
        break;
      case "h2r_create_position":
        result = createPosition({
          title: input.title,
          department: input.department,
          authorityDomain: input.authorityDomain,
          authorityTier: Number(input.authorityTier)
        });
        break;
      case "h2r_assign_position":
        result = createAssignment({ employeeId: input.employeeId, positionId: input.positionId });
        break;
      case "h2r_end_assignment":
        result = endAssignment(input.assignmentId);
        break;
      case "h2r_issue_credential":
        result = issueCredential({ employeeId: input.employeeId, type: input.type, expiryDate: input.expiryDate });
        break;
      case "h2r_expire_credential":
        result = expireCredential(input.credentialId);
        break;
      case "h2r_revoke_credential":
        result = revokeCredential(input.credentialId);
        break;
      case "h2r_create_authority_rule":
        result = createAuthorityRule({
          domain: input.domain,
          threshold: Number(input.threshold),
          requiredTier: Number(input.requiredTier)
        });
        break;
      default:
        throw new HttpError(404, "function_not_found", `Unknown MCP function: ${functionName}`);
    }

    res.json({ functionName, result });
  } catch (error) {
    next(error);
  }
});
