import { randomUUID } from "node:crypto";
import { db } from "../db/connection";
import { loadConfig } from "../config/env";
import { LlmClient } from "../llm/types";
import {
  CaiplArtefact,
  CaiplCollectionState,
  CaiplCollectionSlot,
  CaiplCreateSessionResponse,
  CaiplDecisionPoint,
  CaiplDecisionResolveResponse,
  CaiplDecisionStatus,
  CaiplGraphDelta,
  CaiplInteractionTurn,
  CaiplNotebookDelta,
  CaiplPlanEdge,
  CaiplPlanGraph,
  CaiplSession,
  CaiplSessionSnapshot,
  CaiplTurnResponse,
  CaiplVersionMismatch
} from "../contracts/caiplTypes";
import { HttpError } from "../utils/errors";

const config = loadConfig();

type LinaMode = "create" | "select" | "investigate" | "fix" | "advance";

interface CreateSessionInput {
  userId: string;
  currentGoal: string;
  roleContext?: string;
  mode?: LinaMode;
}

interface SubmitTurnInput {
  actor: "user" | "ai" | "system";
  messageText: string;
  sessionVersion: number;
  roleContext?: string;
  mode?: LinaMode;
}

interface ResolveDecisionInput {
  action: "confirm" | "reject" | "amend" | "retry" | "escalate";
  actorId: string;
  decisionVersion: number;
  sessionVersion: number;
  note?: string;
  formInput?: Record<string, unknown>;
  optionId?: string;
}

interface CaiplSessionRecord {
  session: CaiplSession;
  turns: CaiplInteractionTurn[];
  decisions: CaiplDecisionPoint[];
  planGraph: CaiplPlanGraph;
  notebook: CaiplArtefact[];
}

interface ExecutionReceiptSummary {
  operation: string;
  entityType: string;
  entityId: string;
  status: string;
  createdAt: string;
}

interface PurchaseOrderProposal {
  supplierId: string;
  sku: string;
  itemDescription: string;
  quantity: number;
  unitPrice: number;
  currencyCode: string;
  deliveryAddress: string;
}

type VersionMismatchResult = {
  conflict: CaiplVersionMismatch;
};

interface LinaInteractionContext {
  roleContext?: string;
  mode?: LinaMode;
}

type CollectionDomain = "o2c" | "p2p" | "r2r" | "h2r" | "inv" | "proj";

interface CollectionFieldDefinition {
  id: string;
  label: string;
  type: "string" | "number" | "date" | "enum" | "entityRef";
  required: boolean;
  options?: string[];
}

interface CollectionOperationDefinition {
  operation: string;
  domain: CollectionDomain;
  label: string;
  fields: CollectionFieldDefinition[];
}

const COLLECTION_OPERATIONS: Record<string, CollectionOperationDefinition> = {
  o2c_create_customer: {
    operation: "o2c_create_customer",
    domain: "o2c",
    label: "Customer Creation",
    fields: [
      { id: "customerName", label: "Customer Name", type: "string", required: true },
      { id: "email", label: "Email", type: "string", required: false },
      { id: "billingAddress", label: "Billing Address", type: "string", required: false },
      { id: "shippingAddress", label: "Shipping Address", type: "string", required: false }
    ]
  },
  o2c_create_quote: {
    operation: "o2c_create_quote",
    domain: "o2c",
    label: "Quote Creation",
    fields: [
      { id: "customerId", label: "Customer ID", type: "string", required: false },
      { id: "customerName", label: "Customer Name", type: "string", required: false },
      { id: "customerEmail", label: "Customer Email", type: "string", required: false },
      { id: "legalEntityId", label: "Legal Entity ID", type: "string", required: true },
      { id: "projectId", label: "Project ID", type: "string", required: false },
      { id: "currencyCode", label: "Currency Code", type: "string", required: true },
      { id: "lineSku", label: "Line SKU", type: "string", required: false },
      { id: "lineQuantity", label: "Line Quantity", type: "number", required: false },
      { id: "lineUnitPrice", label: "Line Unit Price", type: "number", required: false },
      { id: "lineTaxTreatment", label: "Line Tax Treatment", type: "string", required: false }
    ]
  },
  o2c_register_payment: {
    operation: "o2c_register_payment",
    domain: "o2c",
    label: "AR Payment Registration",
    fields: [
      { id: "invoiceId", label: "Invoice ID", type: "string", required: true },
      { id: "amount", label: "Amount", type: "number", required: true },
      { id: "currencyCode", label: "Currency Code", type: "string", required: true },
      { id: "method", label: "Method", type: "string", required: true },
      { id: "paymentDate", label: "Payment Date", type: "date", required: false }
    ]
  },
  p2p_create_supplier: {
    operation: "p2p_create_supplier",
    domain: "p2p",
    label: "Supplier Creation",
    fields: [
      { id: "supplierName", label: "Supplier Name", type: "string", required: true },
      { id: "email", label: "Email", type: "string", required: false },
      { id: "paymentTerms", label: "Payment Terms", type: "string", required: false },
      { id: "taxId", label: "Tax ID", type: "string", required: false },
      { id: "currencyCode", label: "Currency Code", type: "string", required: true }
    ]
  },
  proj_create_project: {
    operation: "proj_create_project",
    domain: "proj",
    label: "Project Creation",
    fields: [
      { id: "name", label: "Project Name", type: "string", required: true },
      { id: "projectType", label: "Project Type", type: "enum", required: true, options: ["Internal", "Capital", "Billable", "Service"] },
      { id: "description", label: "Description", type: "string", required: false },
      { id: "budgetAmount", label: "Budget Amount", type: "number", required: true },
      { id: "startDate", label: "Start Date", type: "date", required: true },
      { id: "endDate", label: "End Date", type: "date", required: false },
      { id: "projectManagerId", label: "Project Manager ID", type: "string", required: true },
      { id: "organizationId", label: "Organization ID", type: "string", required: true }
    ]
  },
  p2p_create_requisition: {
    operation: "p2p_create_requisition",
    domain: "p2p",
    label: "Requisition Creation",
    fields: [
      { id: "requester", label: "Requester", type: "string", required: true },
      { id: "department", label: "Department", type: "string", required: true },
      { id: "currencyCode", label: "Currency Code", type: "string", required: true },
      { id: "neededByDate", label: "Needed By Date", type: "date", required: true },
      { id: "legalEntityId", label: "Legal Entity ID", type: "string", required: true },
      { id: "projectId", label: "Project ID", type: "string", required: false }
    ]
  },
  p2p_create_po: {
    operation: "p2p_create_po",
    domain: "p2p",
    label: "Purchase Order Creation",
    fields: [
      { id: "supplierId", label: "Supplier ID", type: "string", required: true },
      { id: "requisitionId", label: "Requisition ID", type: "string", required: false },
      { id: "totalAmount", label: "Total Amount", type: "number", required: true },
      { id: "currencyCode", label: "Currency Code", type: "string", required: true },
      { id: "deliveryAddress", label: "Delivery Address", type: "string", required: false }
    ]
  },
  p2p_create_goods_receipt: {
    operation: "p2p_create_goods_receipt",
    domain: "p2p",
    label: "Goods Receipt Creation",
    fields: [{ id: "poId", label: "PO ID", type: "string", required: true }]
  },
  p2p_create_supplier_invoice: {
    operation: "p2p_create_supplier_invoice",
    domain: "p2p",
    label: "Supplier Invoice Creation",
    fields: [
      { id: "receiptId", label: "Receipt ID", type: "string", required: true },
      { id: "invoiceDate", label: "Invoice Date", type: "date", required: false },
      { id: "dueDate", label: "Due Date", type: "date", required: false },
      { id: "currencyCode", label: "Currency Code", type: "string", required: true }
    ]
  },
  p2p_create_ap_payment: {
    operation: "p2p_create_ap_payment",
    domain: "p2p",
    label: "AP Payment Creation",
    fields: [
      { id: "supplierInvoiceId", label: "Supplier Invoice ID", type: "string", required: true },
      { id: "amount", label: "Amount", type: "number", required: true },
      { id: "currencyCode", label: "Currency Code", type: "string", required: true },
      { id: "method", label: "Method", type: "string", required: true }
    ]
  },
  r2r_create_manual_journal: {
    operation: "r2r_create_manual_journal",
    domain: "r2r",
    label: "Manual Journal Creation",
    fields: [
      { id: "legalEntityId", label: "Legal Entity ID", type: "string", required: true },
      { id: "ledgerId", label: "Ledger ID", type: "string", required: true },
      { id: "fiscalPeriodId", label: "Fiscal Period ID", type: "string", required: true },
      { id: "description", label: "Description", type: "string", required: false },
      { id: "debitAccountId", label: "Debit Account ID", type: "string", required: true },
      { id: "creditAccountId", label: "Credit Account ID", type: "string", required: true },
      { id: "amount", label: "Amount", type: "number", required: true },
      { id: "memo", label: "Memo", type: "string", required: false }
    ]
  },
  h2r_create_employee: {
    operation: "h2r_create_employee",
    domain: "h2r",
    label: "Employee Creation",
    fields: [
      { id: "name", label: "Employee Name", type: "string", required: true },
      { id: "email", label: "Employee Email", type: "string", required: true },
      { id: "autoActivate", label: "Auto Activate", type: "enum", required: false, options: ["true", "false"] }
    ]
  }
};

function defaultCollectionValues(operation: CollectionOperationDefinition, userId: string): Record<string, unknown> {
  const today = new Date().toISOString().slice(0, 10);

  if (operation.operation === "proj_create_project") {
    return {
      projectType: "Internal",
      budgetAmount: 10000,
      startDate: today,
      projectManagerId: userId || "principal.system",
      organizationId: "Projects Default Organization",
      defaultWIPAccountId: "ACCT-WIP-001",
      defaultCloseAccountId: "ACCT-CLOSE-001"
    };
  }

  if (operation.operation === "o2c_create_quote") {
    return {
      currencyCode: "USD",
      lineQuantity: 1,
      lineUnitPrice: 0
    };
  }

  if (operation.operation === "o2c_register_payment") {
    return {
      currencyCode: "USD",
      method: "bank-transfer"
    };
  }

  if (operation.operation === "p2p_create_supplier") {
    return {
      paymentTerms: "NET30",
      currencyCode: "USD"
    };
  }

  if (operation.operation === "p2p_create_requisition") {
    return {
      currencyCode: "USD"
    };
  }

  if (operation.operation === "p2p_create_po") {
    return {
      currencyCode: "USD",
      totalAmount: 0
    };
  }

  if (operation.operation === "p2p_create_supplier_invoice") {
    return {
      currencyCode: "USD"
    };
  }

  if (operation.operation === "p2p_create_ap_payment") {
    return {
      currencyCode: "USD",
      method: "bank-transfer",
      amount: 0
    };
  }

  if (operation.operation === "r2r_create_manual_journal") {
    return {
      amount: 0
    };
  }

  if (operation.operation === "h2r_create_employee") {
    return {
      autoActivate: "true"
    };
  }

  return {};
}

function buildCollectionState(
  operation: CollectionOperationDefinition,
  mergedValues: Record<string, unknown>,
  autoFilledFieldIds: Set<string>
): CaiplCollectionState {
  const slots: CaiplCollectionSlot[] = operation.fields.map((field) => {
    const value = mergedValues[field.id];
    const known = hasValue(value);
    const autoFilled = known && autoFilledFieldIds.has(field.id);
    return {
      fieldId: field.id,
      label: field.label,
      type: field.type,
      required: field.required,
      status: known ? (autoFilled ? "auto_filled" : "known") : "missing",
      value,
      source: known ? (autoFilled ? "system" : "user") : undefined
    };
  });

  const requiredFields = slots.filter((slot) => slot.required).map((slot) => slot.fieldId);
  const resolvedFields = slots.filter((slot) => slot.status !== "missing").map((slot) => slot.fieldId);
  const missingFields = slots.filter((slot) => slot.required && slot.status === "missing").map((slot) => slot.fieldId);

  return {
    domain: operation.domain,
    operation: operation.operation,
    requiredFields,
    resolvedFields,
    missingFields,
    slots
  };
}
function buildPurchaseOrderDecisionOptions(
  poProposal: PurchaseOrderProposal,
  description: string
): CaiplDecisionPoint["options"] {
  return [
    {
      id: "confirm-next-step",
      label: "Create Purchase Order",
      description,
      actionPayload: {
        operation: "execute_purchase_order",
        supplierId: poProposal.supplierId,
        sku: poProposal.sku,
        itemDescription: poProposal.itemDescription,
        quantity: poProposal.quantity,
        unitPrice: poProposal.unitPrice,
        currencyCode: poProposal.currencyCode,
        deliveryAddress: poProposal.deliveryAddress
      },
      inputSchema: purchaseOrderInputSchema()
    },
    {
      id: "find-gl-account",
      label: "Find GL Account",
      description: "Find a suitable GL account and cost center before creating the PO.",
      actionPayload: { operation: "find_gl_account" },
      inputSchema: {
        fields: [
          { id: "expensePurpose", label: "Expense Purpose", type: "string", required: true },
          { id: "projectOrDept", label: "Project or Department", type: "string", required: false }
        ]
      }
    },
    {
      id: "start-requisition",
      label: "Start Requisition Workflow",
      description: "Create or validate requisition and budget approval before PO creation.",
      actionPayload: { operation: "start_requisition_workflow" },
      inputSchema: {
        fields: [
          { id: "requestReason", label: "Request Reason", type: "string", required: true },
          { id: "neededByDate", label: "Needed By Date", type: "date", required: true }
        ]
      }
    },
    {
      id: "suggest-delivery-dates",
      label: "Suggest Delivery Date Options",
      description: "Generate feasible delivery date options to choose from.",
      actionPayload: { operation: "propose_delivery_dates" },
      inputSchema: {
        fields: [
          { id: "earliestDate", label: "Earliest Date", type: "date", required: false },
          { id: "latestDate", label: "Latest Date", type: "date", required: false }
        ]
      }
    }
  ];
}

function emptyGraphDelta(): CaiplGraphDelta {
  return {
    addedNodes: [],
    updatedNodes: [],
    removedNodes: [],
    addedEdges: [],
    removedEdges: []
  };
}

function emptyNotebookDelta(): CaiplNotebookDelta {
  return {
    added: [],
    updated: [],
    removed: []
  };
}

function decisionStatusForAction(action: ResolveDecisionInput["action"]): CaiplDecisionStatus {
  switch (action) {
    case "confirm":
      return "executed";
    case "reject":
      return "resolved";
    case "amend":
      return "resolved";
    case "retry":
      return "pending";
    case "escalate":
      return "escalated";
    default:
      return "failed";
  }
}

function nodeStatusForDecisionStatus(status: CaiplDecisionStatus): "pending" | "active" | "completed" | "blocked" | "failed" {
  switch (status) {
    case "executed":
    case "resolved":
      return "completed";
    case "failed":
    case "escalated":
      return "failed";
    case "pending":
      return "pending";
    case "confirmed":
    case "executing":
      return "active";
    default:
      return "blocked";
  }
}

function serializeArtefactContent(content: Record<string, unknown> | string): {
  contentJson: string | null;
  contentText: string | null;
} {
  if (typeof content === "string") {
    return {
      contentJson: null,
      contentText: content
    };
  }

  return {
    contentJson: JSON.stringify(content),
    contentText: null
  };
}

function normalizedBaseUrl(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function extractPurchaseOrderProposal(messageText: string): PurchaseOrderProposal | null {
  const supplierIdMatch = messageText.match(/\bSUP-[A-Za-z0-9-]+\b/);
  const skuMatch = messageText.match(/\bSKU-[A-Za-z0-9_-]+\b/);
  const quantityMatch = messageText.match(/quantity\s*[:=\-]?\s*([0-9]+(?:\.[0-9]+)?)/i);
  const unitPriceMatch = messageText.match(/unit\s*price\s*[:=\-]?\s*([0-9]+(?:\.[0-9]+)?)/i);

  if (!supplierIdMatch || !skuMatch || !quantityMatch || !unitPriceMatch) {
    return null;
  }

  const itemMatch = messageText.match(/item\s*[:=\-]?\s*([^\n\r]+)/i);
  const addressMatch = messageText.match(/delivery\s*address\s*[:=\-]?\s*([^\n\r]+)/i);
  const currencyMatch = messageText.match(/\b(AED|USD|EUR|GBP|SAR|QAR)\b/i);

  const quantity = Number(quantityMatch[1]);
  const unitPrice = Number(unitPriceMatch[1]);
  if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitPrice) || unitPrice < 0) {
    return null;
  }

  return {
    supplierId: supplierIdMatch[0],
    sku: skuMatch[0],
    itemDescription: itemMatch?.[1]?.trim() || skuMatch[0],
    quantity,
    unitPrice,
    currencyCode: (currencyMatch?.[1] ?? "AED").toUpperCase(),
    deliveryAddress: addressMatch?.[1]?.trim() || "TBD"
  };
}

function inferCollectionOperation(messageText: string, context: LinaInteractionContext): CollectionOperationDefinition | undefined {
  const text = messageText.toLowerCase();

  if (context.mode === "create" && /project\b/.test(text)) {
    return COLLECTION_OPERATIONS["proj_create_project"];
  }

  if (/customer\b/.test(text)) {
    return COLLECTION_OPERATIONS["o2c_create_customer"];
  }

  if (/quote\b|sales\s+quote/.test(text)) {
    return COLLECTION_OPERATIONS["o2c_create_quote"];
  }

  if (/payment\b.*\bar\b|\bar\b.*payment|register\s+payment/.test(text)) {
    return COLLECTION_OPERATIONS["o2c_register_payment"];
  }

  if (/supplier\b/.test(text) && !/invoice/.test(text)) {
    return COLLECTION_OPERATIONS["p2p_create_supplier"];
  }

  if (/requisition\b|purchase\s+request/.test(text)) {
    return COLLECTION_OPERATIONS["p2p_create_requisition"];
  }

  if (/purchase\s+order\b|\bpo\b/.test(text)) {
    return COLLECTION_OPERATIONS["p2p_create_po"];
  }

  if (/goods\s+receipt/.test(text)) {
    return COLLECTION_OPERATIONS["p2p_create_goods_receipt"];
  }

  if (/supplier\s+invoice/.test(text)) {
    return COLLECTION_OPERATIONS["p2p_create_supplier_invoice"];
  }

  if (/ap\s+payment|accounts\s+payable\s+payment/.test(text)) {
    return COLLECTION_OPERATIONS["p2p_create_ap_payment"];
  }

  if (/journal\b/.test(text)) {
    return COLLECTION_OPERATIONS["r2r_create_manual_journal"];
  }

  if (/employee\b/.test(text)) {
    return COLLECTION_OPERATIONS["h2r_create_employee"];
  }

  return undefined;
}

function readFirstMatch(pattern: RegExp, text: string): string | undefined {
  const match = text.match(pattern);
  return match?.[1]?.trim();
}

function extractFieldValue(fieldId: string, text: string): unknown {
  switch (fieldId) {
    case "name":
      return readFirstMatch(/project\s+name\s*[:=\-]?\s*([^\n\r]+)/i, text);
    case "description":
      return readFirstMatch(/description\s*[:=\-]?\s*([^\n\r]+)/i, text);
    case "customerName":
      return readFirstMatch(/customer\s+name\s*[:=\-]?\s*([^\n\r]+)/i, text);
    case "customerEmail":
    case "email":
      return readFirstMatch(/email\s*[:=\-]?\s*([^\s\n\r]+)/i, text);
    case "billingAddress":
      return readFirstMatch(/billing\s+address\s*[:=\-]?\s*([^\n\r]+)/i, text);
    case "shippingAddress":
      return readFirstMatch(/shipping\s+address\s*[:=\-]?\s*([^\n\r]+)/i, text);
    case "customerId":
      return readFirstMatch(/customer\s*(?:id)?\s*[:=\-]?\s*([A-Za-z0-9_-]+)/i, text);
    case "projectType": {
      const value = readFirstMatch(/project\s*type\s*[:=\-]?\s*(internal|capital|billable|service)/i, text);
      return value ? value[0].toUpperCase() + value.slice(1).toLowerCase() : undefined;
    }
    case "budgetAmount": {
      const value = readFirstMatch(/budget\s*[:=\-]?\s*([0-9]+(?:\.[0-9]+)?)/i, text);
      return value ? Number(value) : undefined;
    }
    case "defaultWIPAccountId":
      return readFirstMatch(/wip\s+account\s*[:=\-]?\s*([A-Za-z0-9_-]+)/i, text);
    case "defaultCloseAccountId":
      return readFirstMatch(/close\s+account\s*[:=\-]?\s*([A-Za-z0-9_-]+)/i, text);
    case "projectManagerId":
      return readFirstMatch(/project\s+manager\s*(?:id)?\s*[:=\-]?\s*([A-Za-z0-9@._-]+)/i, text);
    case "organizationId":
      return readFirstMatch(/organization\s*(?:id)?\s*[:=\-]?\s*([A-Za-z0-9_-]+)/i, text);
    case "startDate":
      return readFirstMatch(/start\s+date\s*[:=\-]?\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/i, text);
    case "endDate":
      return readFirstMatch(/end\s+date\s*[:=\-]?\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/i, text);
    case "requester":
      return readFirstMatch(/requester\s*[:=\-]?\s*([^\n\r,]+)/i, text);
    case "department":
      return readFirstMatch(/department\s*[:=\-]?\s*([^\n\r,]+)/i, text);
    case "supplierName":
      return readFirstMatch(/supplier\s+name\s*[:=\-]?\s*([^\n\r]+)/i, text);
    case "supplierId":
      return readFirstMatch(/supplier\s*(?:id)?\s*[:=\-]?\s*([A-Za-z0-9_-]+)/i, text);
    case "paymentTerms":
      return readFirstMatch(/payment\s+terms\s*[:=\-]?\s*([^\n\r]+)/i, text);
    case "taxId":
      return readFirstMatch(/tax\s*id\s*[:=\-]?\s*([A-Za-z0-9_-]+)/i, text);
    case "currencyCode": {
      const code = readFirstMatch(/\b(AED|USD|EUR|GBP|SAR|QAR)\b/i, text);
      return code?.toUpperCase();
    }
    case "neededByDate":
      return readFirstMatch(/needed\s+by\s+date\s*[:=\-]?\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/i, text);
    case "legalEntityId":
      return readFirstMatch(/legal\s+entity\s*(?:id)?\s*[:=\-]?\s*([A-Za-z0-9_-]+)/i, text);
    case "projectId":
      return readFirstMatch(/project\s*(?:id)?\s*[:=\-]?\s*([A-Za-z0-9_-]+)/i, text);
    case "lineSku":
      return readFirstMatch(/sku\s*[:=\-]?\s*([A-Za-z0-9_-]+)/i, text);
    case "lineQuantity": {
      const value = readFirstMatch(/(?:line\s+)?quantity\s*[:=\-]?\s*([0-9]+(?:\.[0-9]+)?)/i, text);
      return value ? Number(value) : undefined;
    }
    case "lineUnitPrice": {
      const value = readFirstMatch(/(?:line\s+)?unit\s*price\s*[:=\-]?\s*([0-9]+(?:\.[0-9]+)?)/i, text);
      return value ? Number(value) : undefined;
    }
    case "lineTaxTreatment":
      return readFirstMatch(/tax\s+treatment\s*[:=\-]?\s*([^\n\r]+)/i, text);
    case "invoiceId":
      return readFirstMatch(/invoice\s*(?:id)?\s*[:=\-]?\s*([A-Za-z0-9_-]+)/i, text);
    case "amount": {
      const value = readFirstMatch(/amount\s*[:=\-]?\s*([0-9]+(?:\.[0-9]+)?)/i, text);
      return value ? Number(value) : undefined;
    }
    case "method":
      return readFirstMatch(/method\s*[:=\-]?\s*([^\n\r]+)/i, text);
    case "paymentDate":
      return readFirstMatch(/payment\s+date\s*[:=\-]?\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/i, text);
    case "requisitionId":
      return readFirstMatch(/requisition\s*(?:id)?\s*[:=\-]?\s*([A-Za-z0-9_-]+)/i, text);
    case "totalAmount": {
      const value = readFirstMatch(/total\s+amount\s*[:=\-]?\s*([0-9]+(?:\.[0-9]+)?)/i, text);
      return value ? Number(value) : undefined;
    }
    case "deliveryAddress":
      return readFirstMatch(/delivery\s+address\s*[:=\-]?\s*([^\n\r]+)/i, text);
    case "poId":
      return readFirstMatch(/(?:purchase\s+order|po)\s*(?:id)?\s*[:=\-]?\s*([A-Za-z0-9_-]+)/i, text);
    case "receiptId":
      return readFirstMatch(/receipt\s*(?:id)?\s*[:=\-]?\s*([A-Za-z0-9_-]+)/i, text);
    case "invoiceDate":
      return readFirstMatch(/invoice\s+date\s*[:=\-]?\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/i, text);
    case "dueDate":
      return readFirstMatch(/due\s+date\s*[:=\-]?\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/i, text);
    case "supplierInvoiceId":
      return readFirstMatch(/supplier\s+invoice\s*(?:id)?\s*[:=\-]?\s*([A-Za-z0-9_-]+)/i, text);
    case "ledgerId":
      return readFirstMatch(/ledger\s*(?:id)?\s*[:=\-]?\s*([A-Za-z0-9_-]+)/i, text);
    case "fiscalPeriodId":
      return readFirstMatch(/fiscal\s+period\s*(?:id)?\s*[:=\-]?\s*([A-Za-z0-9_-]+)/i, text);
    case "debitAccountId":
      return readFirstMatch(/debit\s+account\s*(?:id)?\s*[:=\-]?\s*([A-Za-z0-9_-]+)/i, text);
    case "creditAccountId":
      return readFirstMatch(/credit\s+account\s*(?:id)?\s*[:=\-]?\s*([A-Za-z0-9_-]+)/i, text);
    case "memo":
      return readFirstMatch(/memo\s*[:=\-]?\s*([^\n\r]+)/i, text);
    case "autoActivate": {
      const value = readFirstMatch(/auto\s*activate\s*[:=\-]?\s*(true|false|yes|no)/i, text);
      if (!value) {
        return undefined;
      }
      return ["true", "yes"].includes(value.toLowerCase()) ? "true" : "false";
    }
    default:
      return undefined;
  }
}

function hasValue(value: unknown): boolean {
  if (value === null || value === undefined) {
    return false;
  }
  if (typeof value === "string") {
    return value.trim().length > 0;
  }
  return true;
}


function buildCollectionDecisionOption(operation: CollectionOperationDefinition, collectionState: CaiplCollectionState): CaiplDecisionPoint["options"][number] {
  const missingSlots = collectionState.slots.filter((slot) => slot.required && slot.status === "missing");

  return {
    id: `collect-${operation.operation}`,
    label: `Continue ${operation.label}`,
    description:
      missingSlots.length > 0
        ? `Resolved ${collectionState.resolvedFields.length}/${collectionState.requiredFields.length} required fields. Provide the remaining required inputs.`
        : `All required fields are collected for ${operation.label}. Confirm to proceed to draft preparation.`,
    actionPayload: {
      operation: "collect_fields",
      targetOperation: operation.operation,
      domain: operation.domain
    },
    inputSchema: {
      fields: missingSlots.map((slot) => ({
        id: slot.fieldId,
        label: slot.label,
        type: slot.type,
        required: true,
        options:
          slot.type === "enum"
            ? operation.fields.find((field) => field.id === slot.fieldId)?.options
            : undefined
      }))
    },
    collectionState
  };
}

function buildExecuteCollectionOption(
  operation: CollectionOperationDefinition,
  collectionState: CaiplCollectionState,
  values: Record<string, unknown>
): CaiplDecisionPoint["options"][number] {
  return {
    id: `execute-${operation.operation}`,
    label: `Execute ${operation.label}`,
    description: `All required fields are complete. Confirm to execute ${operation.label}.`,
    actionPayload: {
      operation: "execute_collection_operation",
      targetOperation: operation.operation,
      domain: operation.domain,
      values
    },
    inputSchema: {
      fields: []
    },
    collectionState
  };
}

function buildCollectionAssistantResponse(
  operation: CollectionOperationDefinition,
  collectionState: CaiplCollectionState
): string {
  const missingSlots = collectionState.slots.filter((slot) => slot.required && slot.status === "missing");
  const autoFilledSlots = collectionState.slots.filter((slot) => slot.status === "auto_filled");

  if (missingSlots.length === 0) {
    return `I prepared ${operation.label} using the aligned canvas defaults and collected required inputs. Confirm to proceed.`;
  }

  const missingLabels = missingSlots.map((slot) => slot.label).join(", ");
  const autofillText =
    autoFilledSlots.length > 0
      ? ` Auto-filled defaults: ${autoFilledSlots.map((slot) => slot.label).join(", ")}.`
      : "";

  return `I aligned this to the ${operation.label} manual create form and need: ${missingLabels}.${autofillText}`;
}

function extractRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function toExecutionEntityType(operation: string): string {
  if (operation.includes("customer")) return "customer";
  if (operation.includes("quote")) return "quote";
  if (operation.includes("requisition")) return "requisition";
  if (operation.includes("po") || operation.includes("purchase_order")) return "purchase_order";
  if (operation.includes("goods_receipt")) return "goods_receipt";
  if (operation.includes("supplier_invoice")) return "supplier_invoice";
  if (operation.includes("ap_payment")) return "ap_payment";
  if (operation.includes("journal")) return "journal";
  if (operation.includes("employee")) return "employee";
  if (operation.includes("project")) return "project";
  return "entity";
}

function toExecutionEntityId(result: unknown): string | null {
  const record = extractRecord(result);
  if (!record) {
    return null;
  }

  const idKeys = [
    "customerId",
    "customer_id",
    "quoteId",
    "quote_id",
    "requisitionId",
    "requisition_id",
    "poId",
    "po_id",
    "receiptId",
    "receipt_id",
    "supplierInvoiceId",
    "supplier_invoice_id",
    "paymentId",
    "payment_id",
    "journalId",
    "journal_id",
    "employeeId",
    "employee_id",
    "projectId",
    "project_id",
    "id"
  ];

  for (const key of idKeys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }

  return null;
}

function toExecutionStatus(result: unknown): string {
  const record = extractRecord(result);
  if (!record) {
    return "completed";
  }

  const statusKeys = ["state", "status", "workflowState"];
  for (const key of statusKeys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }

  return "completed";
}

export class CaiplService {
  constructor(private readonly llm: LlmClient) {}

  private summarizeDecisionOption(option: CaiplDecisionPoint["options"][number] | undefined): string {
    if (!option) {
      return "manual action";
    }

    const payload = option.actionPayload;
    const operation = typeof payload["operation"] === "string" ? payload["operation"] : "execute_manual";
    if (operation === "find_gl_account") {
      return "find GL account and cost center";
    }

    if (operation === "start_requisition_workflow") {
      return "start requisition workflow";
    }

    if (operation === "propose_delivery_dates") {
      return "suggest delivery date options";
    }

    if (operation === "execute_collection_operation") {
      const targetOperation =
        typeof payload["targetOperation"] === "string" ? payload["targetOperation"] : "workflow execution";
      return `execute ${targetOperation}`;
    }

    if (operation !== "execute_purchase_order") {
      return "guided data collection follow-up";
    }

    const supplierId = typeof payload["supplierId"] === "string" ? payload["supplierId"] : "unknown supplier";
    const sku = typeof payload["sku"] === "string" ? payload["sku"] : "unknown sku";
    const quantity = typeof payload["quantity"] === "number" ? payload["quantity"] : "?";
    const unitPrice = typeof payload["unitPrice"] === "number" ? payload["unitPrice"] : "?";
    const currencyCode = typeof payload["currencyCode"] === "string" ? payload["currencyCode"] : "AED";
    return `PO ${supplierId} ${sku} qty ${quantity} @ ${unitPrice} ${currencyCode}`;
  }

  private async generatePostDecisionResponse(input: {
    record: CaiplSessionRecord;
    decisionId: string;
    action: ResolveDecisionInput["action"];
    newStatus: CaiplDecisionStatus;
    decisionSummary: string;
    executionReceipt: ExecutionReceiptSummary | null;
    executionError: string | null;
  }): Promise<string> {
    const recentTurns = input.record.turns
      .slice(-8)
      .map((turn) => `${turn.actor.toUpperCase()}: ${turn.messageText}`)
      .join("\n");

    try {
      const llmText = await this.llm.chat([
        {
          role: "system",
          content:
            "You are the CAIPL assistant for Constitutional ERP. The decision has just been resolved. Provide a concise operational follow-up in 3-8 sentences describing exactly what was confirmed and what happened in ERP. Do not ask the user to reconfirm the same decision."
        },
        {
          role: "user",
          content: [
            `Goal: ${input.record.session.currentGoal}`,
            `Decision ID: ${input.decisionId}`,
            `Decision action: ${input.action}`,
            `Decision status: ${input.newStatus}`,
            `Confirmed action details: ${input.decisionSummary}`,
            `Execution receipt: ${JSON.stringify(input.executionReceipt)}`,
            `Execution error: ${input.executionError ?? "none"}`,
            "Recent conversation:",
            recentTurns || "none"
          ].join("\n")
        }
      ]);

      const text = llmText.trim();
      return text.length > 0
        ? text
        : `Decision ${input.decisionId} resolved as ${input.newStatus}. Action: ${input.decisionSummary}.`;
    } catch {
      if (input.executionReceipt) {
        return `Confirmed and executed: ${input.decisionSummary}. ERP receipt ${input.executionReceipt.entityId} is ${input.executionReceipt.status}.`;
      }

      if (input.executionError) {
        return `Decision confirmed but ERP execution failed: ${input.executionError}. Action attempted: ${input.decisionSummary}.`;
      }

      return `Decision ${input.decisionId} resolved as ${input.newStatus}. Action: ${input.decisionSummary}.`;
    }
  }

  private async executePurchaseOrderProposal(
    proposal: PurchaseOrderProposal,
    actorId: string
  ): Promise<ExecutionReceiptSummary> {
    const baseUrl = normalizedBaseUrl(config.foundationErpUrl);
    const headers: Record<string, string> = {
      "content-type": "application/json",
      "x-api-key": config.foundationErpApiKey,
      "x-actor-id": actorId,
      "x-actor-type": actorId === "principal.system" ? "system" : "user",
      "x-actor-tier": actorId === "principal.system" ? "5" : "2"
    };
    headers[config.foundationErpIngressIdHeader] = config.foundationErpIngressId;

    const createResponse = await fetch(`${baseUrl}/api/v1/p2p/purchase-orders`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        supplierId: proposal.supplierId,
        currencyCode: proposal.currencyCode,
        deliveryAddress: proposal.deliveryAddress,
        legalEntityId: "LE-SEED-AE"
      })
    });
    if (!createResponse.ok) {
      throw new Error(`PO create failed (${createResponse.status})`);
    }

    const createdPo = (await createResponse.json()) as Record<string, unknown>;
    const poId = typeof createdPo["po_id"] === "string" ? createdPo["po_id"] : undefined;
    if (!poId) {
      throw new Error("PO create response did not include po_id");
    }

    const lineResponse = await fetch(`${baseUrl}/api/v1/p2p/purchase-orders/${encodeURIComponent(poId)}/lines`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        description: `${proposal.itemDescription} (${proposal.sku})`,
        quantity: proposal.quantity,
        unitPrice: proposal.unitPrice
      })
    });
    if (!lineResponse.ok) {
      throw new Error(`PO line create failed (${lineResponse.status})`);
    }

    const poResponse = await fetch(`${baseUrl}/api/v1/p2p/purchase-orders/${encodeURIComponent(poId)}`, {
      method: "GET",
      headers
    });
    if (!poResponse.ok) {
      throw new Error(`PO fetch failed (${poResponse.status})`);
    }
    const poSnapshot = (await poResponse.json()) as Record<string, unknown>;
    const state = typeof poSnapshot["state"] === "string" ? poSnapshot["state"] : "Draft";

    return {
      operation: "create_purchase_order",
      entityType: "purchase_order",
      entityId: poId,
      status: state,
      createdAt: new Date().toISOString()
    };
  }

  private async executeCollectionOperation(
    targetOperation: string,
    values: Record<string, unknown>,
    actorId: string
  ): Promise<ExecutionReceiptSummary> {
    const baseUrl = normalizedBaseUrl(config.foundationErpUrl);
    const headers: Record<string, string> = {
      "content-type": "application/json",
      "x-api-key": config.foundationErpApiKey,
      "x-actor-id": actorId,
      "x-actor-type": actorId === "principal.system" ? "system" : "user",
      "x-actor-tier": actorId === "principal.system" ? "5" : "2"
    };
    headers[config.foundationErpIngressIdHeader] = config.foundationErpIngressId;

    const response = await fetch(`${baseUrl}/api/v1/mcp/invoke`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        functionName: targetOperation,
        input: values
      })
    });

    if (!response.ok) {
      throw new Error(`${targetOperation} execution failed (${response.status})`);
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const result = payload["result"];
    const entityId = toExecutionEntityId(result);
    if (!entityId) {
      throw new Error(`${targetOperation} did not return an execution entity id`);
    }

    return {
      operation: targetOperation,
      entityType: toExecutionEntityType(targetOperation),
      entityId,
      status: toExecutionStatus(result),
      createdAt: new Date().toISOString()
    };
  }

  private summarizeExecutionReceipts(record: CaiplSessionRecord): ExecutionReceiptSummary[] {
    const receipts: ExecutionReceiptSummary[] = [];

    for (const artefact of record.notebook) {
      if (!artefact.content || typeof artefact.content !== "object" || Array.isArray(artefact.content)) {
        continue;
      }

      const content = artefact.content as Record<string, unknown>;
      if (content["type"] !== "erp_execution_receipt") {
        continue;
      }

      const operation = typeof content["operation"] === "string" ? content["operation"] : "unknown";
      const entityType = typeof content["entityType"] === "string" ? content["entityType"] : "unknown";
      const entityId = typeof content["entityId"] === "string" ? content["entityId"] : "unknown";
      const status = typeof content["status"] === "string" ? content["status"] : "unknown";
      const createdAt = typeof content["createdAt"] === "string" ? content["createdAt"] : "unknown";

      receipts.push({
        operation,
        entityType,
        entityId,
        status,
        createdAt
      });
    }

    return receipts.slice(-5);
  }

  private enforceExecutionGrounding(response: string, hasExecutionReceipt: boolean): string {
    if (hasExecutionReceipt) {
      return response;
    }

    const claimsExecution = /\b(created|issued|approved|sent|executed|posted|updated|cancelled|closed)\b/i.test(response);
    const mentionsTransaction = /\b(po\b|purchase order|requisition|invoice|goods receipt|payment)\b/i.test(response);
    if (!claimsExecution || !mentionsTransaction) {
      return response;
    }

    if (/\bnot executed yet\b|\bproposed only\b/i.test(response)) {
      return response;
    }

    return `Proposed only (not executed yet): ${response}`;
  }

  createSession(input: CreateSessionInput): CaiplCreateSessionResponse {
    const now = new Date().toISOString();
    const sessionId = randomUUID();

    const session: CaiplSession = {
      id: sessionId,
      userId: input.userId,
      createdAt: now,
      updatedAt: now,
      currentGoal: input.currentGoal,
      roleContext: input.roleContext,
      mode: input.mode,
      currentStepId: null,
      status: "active",
      version: 1
    };

    const rootNodeId = randomUUID();
    const planGraph: CaiplPlanGraph = {
      nodes: [
        {
          id: rootNodeId,
          type: "process_step",
          label: "Define execution intent",
          metadata: { goal: input.currentGoal, roleContext: input.roleContext, mode: input.mode },
          status: "active"
        }
      ],
      edges: []
    };

    const initialArtefact: CaiplArtefact = {
      id: randomUUID(),
      type: "note",
      content: `Session started for goal: ${input.currentGoal}${input.roleContext ? ` | role=${input.roleContext}` : ""}${input.mode ? ` | mode=${input.mode}` : ""}`,
      linkedNodeId: rootNodeId
    };

    const turn: CaiplInteractionTurn = {
      id: randomUUID(),
      sessionId,
      actor: "ai",
      messageText: "Session created. I am ready to plan the next step.",
      linkedNodes: [rootNodeId],
      linkedArtefacts: [],
      createdAt: now
    };

    const write = db.transaction(() => {
      db.prepare(
        `INSERT INTO caipl_session(
          id, user_id, created_at, updated_at, current_goal, current_step_id, status, version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        session.id,
        session.userId,
        session.createdAt,
        session.updatedAt,
        session.currentGoal,
        session.currentStepId,
        session.status,
        session.version
      );

      db.prepare(
        `INSERT INTO caipl_turn(
          id, session_id, actor, message_text, linked_nodes_json, linked_artefacts_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(
        turn.id,
        turn.sessionId,
        turn.actor,
        turn.messageText,
        JSON.stringify(turn.linkedNodes),
        JSON.stringify(turn.linkedArtefacts),
        turn.createdAt
      );

      for (const node of planGraph.nodes) {
        db.prepare(
          `INSERT INTO caipl_plan_node(
            id, session_id, node_type, label, metadata_json, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          node.id,
          session.id,
          node.type,
          node.label,
          JSON.stringify(node.metadata),
          node.status,
          now,
          now
        );
      }

      for (const edgeItem of planGraph.edges) {
        db.prepare(
          `INSERT INTO caipl_plan_edge(
            edge_id, session_id, from_node, to_node, edge_type, created_at
          ) VALUES (?, ?, ?, ?, ?, ?)`
        ).run(
          edgeItem.edgeId,
          session.id,
          edgeItem.from,
          edgeItem.to,
          edgeItem.type,
          now
        );
      }

      const serializedInitialContent = serializeArtefactContent(initialArtefact.content);
      db.prepare(
        `INSERT INTO caipl_notebook_artefact(
          id, session_id, artefact_type, content_json, content_text, linked_node_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        initialArtefact.id,
        session.id,
        initialArtefact.type,
        serializedInitialContent.contentJson,
        serializedInitialContent.contentText,
        initialArtefact.linkedNodeId,
        now,
        now
      );
    });

    write();

    return {
      session,
      initialTurns: [turn],
      planGraph,
      notebookSnapshot: [initialArtefact],
      decisions: []
    };
  }

  getSession(sessionId: string): CaiplSessionSnapshot {
    const record = this.requireSession(sessionId);
    return {
      session: record.session,
      turns: record.turns,
      decisions: record.decisions,
      planGraph: record.planGraph,
      notebook: record.notebook
    };
  }

  async submitTurn(sessionId: string, input: SubmitTurnInput): Promise<CaiplTurnResponse | VersionMismatchResult> {
    const record = this.requireSession(sessionId);

    if (input.sessionVersion !== record.session.version) {
      return {
        conflict: {
          scope: "session",
          currentVersion: record.session.version,
          sessionId
        }
      };
    }

    const now = new Date().toISOString();
    const userTurn: CaiplInteractionTurn = {
      id: randomUUID(),
      sessionId,
      actor: input.actor,
      messageText: input.messageText,
      linkedNodes: [],
      linkedArtefacts: [],
      createdAt: now
    };

    const interactionContext = this.resolveInteractionContext(record, {
      roleContext: input.roleContext,
      mode: input.mode
    });
    const inferredCollectionOperation = inferCollectionOperation(input.messageText, interactionContext);

    let assistant = await this.generateAssistantResponse(record, input.messageText, interactionContext);

    let collectionState: CaiplCollectionState | undefined;
    let collectionValues: Record<string, unknown> | undefined;
    if (inferredCollectionOperation) {
      const defaults = defaultCollectionValues(inferredCollectionOperation, record.session.userId);
      const previousValues = this.readLatestCollectionValues(record, inferredCollectionOperation.operation);
      const extractedValues = this.extractCollectionValuesFromMessage(inferredCollectionOperation, input.messageText);
      collectionValues = {
        ...defaults,
        ...previousValues,
        ...extractedValues
      };
      const autoFilledFieldIds = new Set(
        Object.keys(defaults).filter(
          (fieldId) => !hasValue(previousValues[fieldId]) && !hasValue(extractedValues[fieldId])
        )
      );
      collectionState = buildCollectionState(inferredCollectionOperation, collectionValues, autoFilledFieldIds);
      assistant = {
        ...assistant,
        response: buildCollectionAssistantResponse(inferredCollectionOperation, collectionState),
        collectionHints: {
          requiredFields: collectionState.requiredFields,
          resolvedFields: collectionState.resolvedFields,
          missingFields: collectionState.missingFields,
          recommendedNextOperation: inferredCollectionOperation.operation
        }
      };
    }

    const aiTurn: CaiplInteractionTurn = {
      id: randomUUID(),
      sessionId,
      actor: "ai",
      messageText: assistant.response,
      linkedNodes: [],
      linkedArtefacts: [],
      createdAt: now
    };
    const linkedNodeId = record.planGraph.nodes[0]?.id ?? "unlinked";
    const notebookArtefact: CaiplArtefact = {
      id: randomUUID(),
      type: "note",
      content: {
        type: "llm_turn_reasoning",
        prompt: input.messageText,
        roleContext: interactionContext.roleContext,
        mode: interactionContext.mode,
        response: assistant.response,
        reasoningSummary: assistant.reasoning,
        requiredFields: assistant.collectionHints?.requiredFields,
        resolvedFields: assistant.collectionHints?.resolvedFields,
        missingFields: assistant.collectionHints?.missingFields,
        recommendedNextOperation: assistant.collectionHints?.recommendedNextOperation,
        provider: this.llm.provider,
        model: this.llm.model
      },
      linkedNodeId
    };
    const collectionStateArtefact: CaiplArtefact | null =
      collectionState && collectionValues
        ? {
            id: randomUUID(),
            type: "note",
            content: {
              type: "field_collection_state",
              domain: collectionState.domain,
              operation: collectionState.operation,
              requiredFields: collectionState.requiredFields,
              resolvedFields: collectionState.resolvedFields,
              missingFields: collectionState.missingFields,
              slots: collectionState.slots,
              values: collectionValues
            },
            linkedNodeId
          }
        : null;

    const poProposal = extractPurchaseOrderProposal(input.messageText);
    const activeDecision = record.decisions.find((item) => item.status === "pending");
    let createdDecision: CaiplDecisionPoint | null = null;
    let createdDecisionNode: CaiplPlanGraph["nodes"][number] | null = null;
    let createdDecisionEdge: CaiplPlanEdge | null = null;

    if (!activeDecision) {
      const decisionId = randomUUID();
      const decisionNodeId = randomUUID();
      const options = poProposal
        ? buildPurchaseOrderDecisionOptions(
            poProposal,
            assistant.decisionDescription ?? "Proceed with purchase order preparation."
          )
        : collectionState && inferredCollectionOperation
          ? [buildCollectionDecisionOption(inferredCollectionOperation, collectionState)]
        : [
            {
              id: "confirm-next-step",
              label: "Confirm",
              description: assistant.decisionDescription ?? "Proceed with proposed execution.",
              actionPayload: { operation: "execute_manual" },
              inputSchema: { fields: [] }
            }
          ];
      createdDecision = {
        id: decisionId,
        sessionId,
        type: "action_confirmation",
        status: "pending",
        resolvedBy: null,
        resolvedAt: null,
        version: 1,
        options
      };

      createdDecisionNode = {
        id: decisionNodeId,
        type: "decision",
        label:
          collectionState && inferredCollectionOperation
            ? `Collect inputs: ${inferredCollectionOperation.label}`
            : "Confirm next action",
        metadata: { decisionId },
        status: "pending"
      };

      const fromNode = record.planGraph.nodes[record.planGraph.nodes.length - 1]?.id ?? linkedNodeId;
      createdDecisionEdge = {
        edgeId: randomUUID(),
        from: fromNode,
        to: decisionNodeId,
        type: "leads_to"
      };
    }

    if (activeDecision && activeDecision.options.length > 0) {
      const existingExecuteOption = activeDecision.options.find(
        (option) => option.actionPayload["operation"] === "execute_purchase_order"
      );
      const existingCollectionOption = activeDecision.options.find(
        (option) => option.actionPayload["operation"] === "collect_fields"
      );

      if (poProposal && existingExecuteOption) {
        existingExecuteOption.description = assistant.decisionDescription;
        existingExecuteOption.actionPayload = {
          operation: "execute_purchase_order",
          supplierId: poProposal.supplierId,
          sku: poProposal.sku,
          itemDescription: poProposal.itemDescription,
          quantity: poProposal.quantity,
          unitPrice: poProposal.unitPrice,
          currencyCode: poProposal.currencyCode,
          deliveryAddress: poProposal.deliveryAddress
        };
      } else if (collectionState && inferredCollectionOperation && existingCollectionOption) {
        const refreshedOption = buildCollectionDecisionOption(inferredCollectionOperation, collectionState);
        existingCollectionOption.description = refreshedOption.description;
        existingCollectionOption.inputSchema = refreshedOption.inputSchema;
        existingCollectionOption.actionPayload = refreshedOption.actionPayload;
        existingCollectionOption.collectionState = refreshedOption.collectionState;
      } else if (collectionState && inferredCollectionOperation && !existingCollectionOption) {
        activeDecision.options = [buildCollectionDecisionOption(inferredCollectionOperation, collectionState)];
      } else {
        activeDecision.options[0] = {
          ...activeDecision.options[0],
          description: assistant.decisionDescription ?? activeDecision.options[0].description
        };
      }
    }

    const nextVersion = record.session.version + 1;
    const write = db.transaction(() => {
      db.prepare(
        `INSERT INTO caipl_turn(
          id, session_id, actor, message_text, linked_nodes_json, linked_artefacts_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(
        userTurn.id,
        userTurn.sessionId,
        userTurn.actor,
        userTurn.messageText,
        JSON.stringify(userTurn.linkedNodes),
        JSON.stringify(userTurn.linkedArtefacts),
        userTurn.createdAt
      );

      db.prepare(
        `INSERT INTO caipl_turn(
          id, session_id, actor, message_text, linked_nodes_json, linked_artefacts_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(
        aiTurn.id,
        aiTurn.sessionId,
        aiTurn.actor,
        aiTurn.messageText,
        JSON.stringify(aiTurn.linkedNodes),
        JSON.stringify(aiTurn.linkedArtefacts),
        aiTurn.createdAt
      );

      db.prepare(`UPDATE caipl_session SET updated_at = ?, version = ? WHERE id = ?`).run(
        now,
        nextVersion,
        sessionId
      );

      if (activeDecision) {
        db.prepare(
          `UPDATE caipl_decision
           SET options_json = ?, updated_at = ?
           WHERE id = ? AND session_id = ?`
        ).run(JSON.stringify(activeDecision.options), now, activeDecision.id, sessionId);
      }

      if (createdDecision) {
        db.prepare(
          `INSERT INTO caipl_decision(
            id, session_id, decision_type, status, resolved_by, resolved_at, version, options_json, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          createdDecision.id,
          createdDecision.sessionId,
          createdDecision.type,
          createdDecision.status,
          createdDecision.resolvedBy,
          createdDecision.resolvedAt,
          createdDecision.version,
          JSON.stringify(createdDecision.options),
          now,
          now
        );
      }

      if (createdDecisionNode) {
        db.prepare(
          `INSERT INTO caipl_plan_node(
            id, session_id, node_type, label, metadata_json, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          createdDecisionNode.id,
          sessionId,
          createdDecisionNode.type,
          createdDecisionNode.label,
          JSON.stringify(createdDecisionNode.metadata),
          createdDecisionNode.status,
          now,
          now
        );
      }

      if (createdDecisionEdge) {
        db.prepare(
          `INSERT INTO caipl_plan_edge(
            edge_id, session_id, from_node, to_node, edge_type, created_at
          ) VALUES (?, ?, ?, ?, ?, ?)`
        ).run(
          createdDecisionEdge.edgeId,
          sessionId,
          createdDecisionEdge.from,
          createdDecisionEdge.to,
          createdDecisionEdge.type,
          now
        );
      }

      const serializedNotebookContent = serializeArtefactContent(notebookArtefact.content);
      db.prepare(
        `INSERT INTO caipl_notebook_artefact(
          id, session_id, artefact_type, content_json, content_text, linked_node_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        notebookArtefact.id,
        sessionId,
        notebookArtefact.type,
        serializedNotebookContent.contentJson,
        serializedNotebookContent.contentText,
        notebookArtefact.linkedNodeId,
        now,
        now
      );

      if (collectionStateArtefact) {
        const serializedCollectionContent = serializeArtefactContent(collectionStateArtefact.content);
        db.prepare(
          `INSERT INTO caipl_notebook_artefact(
            id, session_id, artefact_type, content_json, content_text, linked_node_id, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          collectionStateArtefact.id,
          sessionId,
          collectionStateArtefact.type,
          serializedCollectionContent.contentJson,
          serializedCollectionContent.contentText,
          collectionStateArtefact.linkedNodeId,
          now,
          now
        );
      }
    });

    write();

    record.turns.push(userTurn, aiTurn);
    record.notebook.push(notebookArtefact);
    if (collectionStateArtefact) {
      record.notebook.push(collectionStateArtefact);
    }
    if (createdDecision) {
      record.decisions.push(createdDecision);
    }
    if (createdDecisionNode) {
      record.planGraph.nodes.push(createdDecisionNode);
    }
    if (createdDecisionEdge) {
      record.planGraph.edges.push(createdDecisionEdge);
    }
    record.session.updatedAt = now;
    record.session.version = nextVersion;

    const graphDelta: CaiplGraphDelta = {
      addedNodes: createdDecisionNode ? [createdDecisionNode] : [],
      updatedNodes: [],
      removedNodes: [],
      addedEdges: createdDecisionEdge ? [createdDecisionEdge] : [],
      removedEdges: []
    };

    return {
      newTurns: [userTurn, aiTurn],
      decisionPoints: record.decisions,
      graphDelta,
      notebookDelta: {
        added: collectionStateArtefact ? [notebookArtefact, collectionStateArtefact] : [notebookArtefact],
        updated: [],
        removed: []
      },
      session: record.session
    };
  }

  async resolveDecision(decisionId: string, input: ResolveDecisionInput): Promise<CaiplDecisionResolveResponse | VersionMismatchResult> {
    const match = this.findDecision(decisionId);
    if (!match) {
      throw new HttpError(404, "caipl_decision_not_found", `Decision '${decisionId}' was not found`);
    }

    const { record, decision } = match;
    if (input.sessionVersion !== record.session.version) {
      return {
        conflict: {
          scope: "session",
          currentVersion: record.session.version,
          sessionId: record.session.id,
          decisionId
        }
      };
    }

    if (input.decisionVersion !== decision.version) {
      return {
        conflict: {
          scope: "decision",
          currentVersion: decision.version,
          sessionId: record.session.id,
          decisionId
        }
      };
    }

    if (decision.status !== "pending") {
      throw new HttpError(
        409,
        "caipl_decision_not_pending",
        `Decision '${decisionId}' is already ${decision.status} and cannot be resolved again.`
      );
    }

    const now = new Date().toISOString();
    let newStatus = decisionStatusForAction(input.action);
    const nextDecisionVersion = decision.version + 1;
    const nextSessionVersion = record.session.version + 1;
    let resolvedBy: string | null = null;
    let resolvedAt: string | null = null;
    const linkedNodeId =
      record.planGraph.nodes.find((node) => {
        const candidate = node.metadata["decisionId"];
        return typeof candidate === "string" && candidate === decision.id;
      })?.id ?? record.planGraph.nodes[0]?.id ?? "unlinked";

    const selectedOption =
      (input.optionId ? decision.options.find((option) => option.id === input.optionId) : undefined) ??
      decision.options[0];
    let selectedOperation =
      selectedOption && typeof selectedOption.actionPayload["operation"] === "string"
        ? selectedOption.actionPayload["operation"]
        : "execute_manual";
    let decisionSummary = this.summarizeDecisionOption(selectedOption);

    let executionReceipt: ExecutionReceiptSummary | null = null;
    let executionError: string | null = null;
    let resolvedCollectionState: CaiplCollectionState | null = null;
    let keepPendingForExecution = false;
    if (input.action === "confirm") {
      const payload = { ...(selectedOption?.actionPayload ?? {}), ...(input.formInput ?? {}) };
      if (payload && typeof payload === "object" && payload["operation"] === "collect_fields") {
        const targetOperation =
          typeof payload["targetOperation"] === "string" ? payload["targetOperation"] : undefined;
        const operationDef = targetOperation ? COLLECTION_OPERATIONS[targetOperation] : undefined;
        if (operationDef) {
          const defaults = defaultCollectionValues(operationDef, record.session.userId);
          const previousValues = this.readLatestCollectionValues(record, operationDef.operation);
          const formValues = input.formInput ?? {};
          const mergedValues = {
            ...defaults,
            ...previousValues,
            ...formValues
          };
          const autoFilledFieldIds = new Set(
            Object.keys(defaults).filter(
              (fieldId) => !hasValue(previousValues[fieldId]) && !hasValue(formValues[fieldId])
            )
          );
          const nextCollectionOption = buildCollectionDecisionOption(
            operationDef,
            buildCollectionState(operationDef, mergedValues, autoFilledFieldIds)
          );
          resolvedCollectionState = nextCollectionOption.collectionState ?? null;
          if (selectedOption) {
            selectedOption.description = nextCollectionOption.description;
            selectedOption.inputSchema = nextCollectionOption.inputSchema;
            selectedOption.actionPayload = nextCollectionOption.actionPayload;
            selectedOption.collectionState = nextCollectionOption.collectionState;
          }

          if (resolvedCollectionState && resolvedCollectionState.missingFields.length > 0) {
            newStatus = "pending";
            decisionSummary = `collect ${resolvedCollectionState.missingFields.length} remaining required field(s) for ${operationDef.label}`;
          } else {
            const executeOption = buildExecuteCollectionOption(operationDef, resolvedCollectionState, mergedValues);
            decision.options = [executeOption];
            selectedOperation = "execute_collection_operation";
            keepPendingForExecution = true;
            newStatus = "pending";
            decisionSummary = `field collection completed for ${operationDef.label}; ready for execution`;
          }
        } else {
          newStatus = "resolved";
        }
      } else if (payload && typeof payload === "object" && payload["operation"] === "execute_collection_operation") {
        const targetOperation =
          typeof payload["targetOperation"] === "string" ? payload["targetOperation"] : undefined;
        const valuesCandidate = payload["values"];
        const values =
          valuesCandidate && typeof valuesCandidate === "object" && !Array.isArray(valuesCandidate)
            ? (valuesCandidate as Record<string, unknown>)
            : {};

        if (!targetOperation) {
          newStatus = "failed";
          executionError = "Missing target operation for collection execution";
        } else {
          try {
            executionReceipt = await this.executeCollectionOperation(targetOperation, values, input.actorId);
            newStatus = "executed";
          } catch (error) {
            newStatus = "failed";
            executionError = error instanceof Error ? error.message : "Unknown collection execution error";
          }
        }
      } else if (payload && typeof payload === "object" && payload["operation"] === "execute_purchase_order") {
        const proposal = payload as unknown as PurchaseOrderProposal;
        try {
          executionReceipt = await this.executePurchaseOrderProposal(proposal, input.actorId);
          newStatus = "executed";
        } catch (error) {
          newStatus = "failed";
          executionError = error instanceof Error ? error.message : "Unknown execution error";
        }
      } else {
        newStatus = "resolved";
      }
    }

    if (
      input.action === "confirm" &&
      selectedOperation !== "execute_purchase_order" &&
      selectedOperation !== "execute_collection_operation" &&
      !executionError &&
      !keepPendingForExecution
    ) {
      newStatus = "resolved";
    }

    if (newStatus === "resolved" || newStatus === "executed" || newStatus === "failed") {
      resolvedBy = input.actorId;
      resolvedAt = now;
    }

    const notebookArtefact: CaiplArtefact = {
      id: randomUUID(),
      type: "note",
      content: {
        decisionId: decision.id,
        action: input.action,
        status: newStatus,
        note: input.note ?? null,
        optionId: input.optionId ?? null,
        executionError: executionError ?? null
      },
      linkedNodeId
    };

    const collectionStateArtefact: CaiplArtefact | null =
      resolvedCollectionState && input.action === "confirm"
        ? {
            id: randomUUID(),
            type: "note",
            content: {
              type: "field_collection_state",
              domain: resolvedCollectionState.domain,
              operation: resolvedCollectionState.operation,
              requiredFields: resolvedCollectionState.requiredFields,
              resolvedFields: resolvedCollectionState.resolvedFields,
              missingFields: resolvedCollectionState.missingFields,
              slots: resolvedCollectionState.slots,
              values: Object.fromEntries(
                resolvedCollectionState.slots
                  .filter((slot) => slot.status !== "missing")
                  .map((slot) => [slot.fieldId, slot.value])
              )
            },
            linkedNodeId
          }
        : null;

    const executionReceiptArtefact: CaiplArtefact | null = executionReceipt
      ? {
          id: randomUUID(),
          type: "note",
          content: {
            type: "erp_execution_receipt",
            ...executionReceipt
          },
          linkedNodeId
        }
      : null;

    const decisionTurn: CaiplInteractionTurn = {
      id: randomUUID(),
      sessionId: record.session.id,
      actor: "system",
      messageText:
        executionReceipt
          ? `Decision ${decision.id} updated to ${newStatus}. Confirmed: ${decisionSummary}. ERP execution receipt: ${executionReceipt.entityId} (${executionReceipt.status}).`
          : executionError
            ? `Decision ${decision.id} updated to ${newStatus}. Confirmed: ${decisionSummary}. ERP execution failed: ${executionError}`
            : `Decision ${decision.id} updated to ${newStatus}. Confirmed: ${decisionSummary}.`,
      linkedNodes: [],
      linkedArtefacts: [],
      createdAt: now
    };

    const aiFollowupText = await this.generatePostDecisionResponse({
      record,
      decisionId: decision.id,
      action: input.action,
      newStatus,
      decisionSummary,
      executionReceipt,
      executionError
    });

    const aiFollowupTurn: CaiplInteractionTurn = {
      id: randomUUID(),
      sessionId: record.session.id,
      actor: "ai",
      messageText: aiFollowupText,
      linkedNodes: [],
      linkedArtefacts: [],
      createdAt: now
    };

    const decisionNode = record.planGraph.nodes.find((node) => {
      const value = node.metadata["decisionId"];
      return typeof value === "string" && value === decision.id;
    });
    const decisionNodeStatus = nodeStatusForDecisionStatus(newStatus);
    const graphDelta: CaiplGraphDelta = emptyGraphDelta();
    if (decisionNode) {
      decisionNode.status = decisionNodeStatus;
      decisionNode.label =
        input.action === "confirm"
          ? `Confirmed: ${decisionSummary}`
          : `${input.action[0].toUpperCase()}${input.action.slice(1)}: ${decisionSummary}`;
      decisionNode.metadata = {
        ...decisionNode.metadata,
        lastResolvedAction: input.action,
        lastResolvedStatus: newStatus,
        lastResolvedSummary: decisionSummary,
        lastReceiptEntityId: executionReceipt?.entityId ?? null,
        lastExecutionError: executionError
      };
      graphDelta.updatedNodes = [decisionNode];
    }

    const write = db.transaction(() => {
      db.prepare(
        `UPDATE caipl_decision
         SET status = ?, resolved_by = ?, resolved_at = ?, version = ?, options_json = ?, updated_at = ?
         WHERE id = ?`
      ).run(newStatus, resolvedBy, resolvedAt, nextDecisionVersion, JSON.stringify(decision.options), now, decision.id);

      db.prepare(
        `INSERT INTO caipl_turn(
          id, session_id, actor, message_text, linked_nodes_json, linked_artefacts_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(
        decisionTurn.id,
        decisionTurn.sessionId,
        decisionTurn.actor,
        decisionTurn.messageText,
        JSON.stringify(decisionTurn.linkedNodes),
        JSON.stringify(decisionTurn.linkedArtefacts),
        decisionTurn.createdAt
      );

      db.prepare(
        `INSERT INTO caipl_turn(
          id, session_id, actor, message_text, linked_nodes_json, linked_artefacts_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(
        aiFollowupTurn.id,
        aiFollowupTurn.sessionId,
        aiFollowupTurn.actor,
        aiFollowupTurn.messageText,
        JSON.stringify(aiFollowupTurn.linkedNodes),
        JSON.stringify(aiFollowupTurn.linkedArtefacts),
        aiFollowupTurn.createdAt
      );

      db.prepare(`UPDATE caipl_session SET updated_at = ?, version = ? WHERE id = ?`).run(
        now,
        nextSessionVersion,
        record.session.id
      );

      if (decisionNode) {
        db.prepare(
          `UPDATE caipl_plan_node
           SET label = ?, metadata_json = ?, status = ?, updated_at = ?
           WHERE id = ? AND session_id = ?`
        ).run(
          decisionNode.label,
          JSON.stringify(decisionNode.metadata),
          decisionNodeStatus,
          now,
          decisionNode.id,
          record.session.id
        );
      }

      const serializedNotebookContent = serializeArtefactContent(notebookArtefact.content);
      db.prepare(
        `INSERT INTO caipl_notebook_artefact(
          id, session_id, artefact_type, content_json, content_text, linked_node_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        notebookArtefact.id,
        record.session.id,
        notebookArtefact.type,
        serializedNotebookContent.contentJson,
        serializedNotebookContent.contentText,
        notebookArtefact.linkedNodeId,
        now,
        now
      );

      if (collectionStateArtefact) {
        const serializedCollectionContent = serializeArtefactContent(collectionStateArtefact.content);
        db.prepare(
          `INSERT INTO caipl_notebook_artefact(
            id, session_id, artefact_type, content_json, content_text, linked_node_id, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          collectionStateArtefact.id,
          record.session.id,
          collectionStateArtefact.type,
          serializedCollectionContent.contentJson,
          serializedCollectionContent.contentText,
          collectionStateArtefact.linkedNodeId,
          now,
          now
        );
      }

      if (executionReceiptArtefact) {
        const serializedExecutionReceiptContent = serializeArtefactContent(executionReceiptArtefact.content);
        db.prepare(
          `INSERT INTO caipl_notebook_artefact(
            id, session_id, artefact_type, content_json, content_text, linked_node_id, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          executionReceiptArtefact.id,
          record.session.id,
          executionReceiptArtefact.type,
          serializedExecutionReceiptContent.contentJson,
          serializedExecutionReceiptContent.contentText,
          executionReceiptArtefact.linkedNodeId,
          now,
          now
        );
      }
    });

    write();

    decision.status = newStatus;
    decision.version = nextDecisionVersion;
    decision.resolvedBy = resolvedBy;
    decision.resolvedAt = resolvedAt;

    record.session.updatedAt = now;
    record.session.version = nextSessionVersion;
    record.turns.push(decisionTurn, aiFollowupTurn);
    record.notebook.push(notebookArtefact);
    if (collectionStateArtefact) {
      record.notebook.push(collectionStateArtefact);
    }
    if (executionReceiptArtefact) {
      record.notebook.push(executionReceiptArtefact);
    }

    return {
      updatedDecision: decision,
      graphDelta,
      notebookDelta: {
        added: executionReceiptArtefact
          ? collectionStateArtefact
            ? [notebookArtefact, collectionStateArtefact, executionReceiptArtefact]
            : [notebookArtefact, executionReceiptArtefact]
          : collectionStateArtefact
            ? [notebookArtefact, collectionStateArtefact]
            : [notebookArtefact],
        updated: [],
        removed: []
      },
      newTurns: [decisionTurn, aiFollowupTurn],
      session: record.session
    };
  }

  private findDecision(decisionId: string): { record: CaiplSessionRecord; decision: CaiplDecisionPoint } | undefined {
    const rows = db.prepare(`SELECT id FROM caipl_session`).all() as Array<{ id: string }>;
    for (const row of rows) {
      const record = this.requireSession(row.id);
      const decision = record.decisions.find((item) => item.id === decisionId);
      if (decision) {
        return { record, decision };
      }
    }

    return undefined;
  }

  private requireSession(sessionId: string): CaiplSessionRecord {
    const sessionRow = db.prepare(
      `SELECT id, user_id, created_at, updated_at, current_goal, current_step_id, status, version
       FROM caipl_session WHERE id = ?`
    ).get(sessionId) as
      | {
          id: string;
          user_id: string;
          created_at: string;
          updated_at: string;
          current_goal: string;
          current_step_id: string | null;
          status: "active" | "archived";
          version: number;
        }
      | undefined;

    if (!sessionRow) {
      throw new HttpError(404, "caipl_session_not_found", `Session '${sessionId}' was not found`);
    }

    const turns = db.prepare(
      `SELECT id, session_id, actor, message_text, linked_nodes_json, linked_artefacts_json, created_at
       FROM caipl_turn WHERE session_id = ? ORDER BY created_at ASC`
    ).all(sessionId) as Array<{
      id: string;
      session_id: string;
      actor: "user" | "ai" | "system";
      message_text: string;
      linked_nodes_json: string;
      linked_artefacts_json: string;
      created_at: string;
    }>;

    const decisions = db.prepare(
      `SELECT id, session_id, decision_type, status, resolved_by, resolved_at, version, options_json
       FROM caipl_decision WHERE session_id = ? ORDER BY created_at ASC`
    ).all(sessionId) as Array<{
      id: string;
      session_id: string;
      decision_type: string;
      status: CaiplDecisionStatus;
      resolved_by: string | null;
      resolved_at: string | null;
      version: number;
      options_json: string;
    }>;

    const nodes = db.prepare(
      `SELECT id, node_type, label, metadata_json, status
       FROM caipl_plan_node WHERE session_id = ? ORDER BY created_at ASC`
    ).all(sessionId) as Array<{
      id: string;
      node_type: "process_step" | "entity" | "decision" | "data_collection" | "mcp_action";
      label: string;
      metadata_json: string;
      status: "pending" | "active" | "completed" | "blocked" | "failed";
    }>;

    const edges = db.prepare(
      `SELECT edge_id, from_node, to_node, edge_type
       FROM caipl_plan_edge WHERE session_id = ? ORDER BY created_at ASC`
    ).all(sessionId) as Array<{
      edge_id: string;
      from_node: string;
      to_node: string;
      edge_type: "depends_on" | "leads_to" | "requires";
    }>;

    const notebook = db.prepare(
      `SELECT id, artefact_type, content_json, content_text, linked_node_id
       FROM caipl_notebook_artefact WHERE session_id = ? ORDER BY created_at ASC`
    ).all(sessionId) as Array<{
      id: string;
      artefact_type: "document" | "note" | "form" | "table";
      content_json: string | null;
      content_text: string | null;
      linked_node_id: string;
    }>;

    const mappedNodes = nodes.map((node) => ({
      id: node.id,
      type: node.node_type,
      label: node.label,
      metadata: this.parseJsonObject(node.metadata_json),
      status: node.status
    }));
    const contextFromRoot = this.extractContextFromNodeMetadata(mappedNodes[0]?.metadata);

    return {
      session: {
        id: sessionRow.id,
        userId: sessionRow.user_id,
        createdAt: sessionRow.created_at,
        updatedAt: sessionRow.updated_at,
        currentGoal: sessionRow.current_goal,
        roleContext: contextFromRoot.roleContext,
        mode: contextFromRoot.mode,
        currentStepId: sessionRow.current_step_id,
        status: sessionRow.status,
        version: sessionRow.version
      },
      turns: turns.map((row) => ({
        id: row.id,
        sessionId: row.session_id,
        actor: row.actor,
        messageText: row.message_text,
        linkedNodes: this.parseStringArray(row.linked_nodes_json),
        linkedArtefacts: this.parseStringArray(row.linked_artefacts_json),
        createdAt: row.created_at
      })),
      decisions: decisions.map((row) => ({
        id: row.id,
        sessionId: row.session_id,
        type: row.decision_type,
        options: this.parseJsonArray(row.options_json) as CaiplDecisionPoint["options"],
        status: row.status,
        resolvedBy: row.resolved_by,
        resolvedAt: row.resolved_at,
        version: row.version
      })),
      planGraph: {
        nodes: mappedNodes,
        edges: edges.map((edge) => ({
          edgeId: edge.edge_id,
          from: edge.from_node,
          to: edge.to_node,
          type: edge.edge_type
        }))
      },
      notebook: notebook.map((artefact) => ({
        id: artefact.id,
        type: artefact.artefact_type,
        content: artefact.content_json ? this.parseJsonObject(artefact.content_json) : artefact.content_text ?? "",
        linkedNodeId: artefact.linked_node_id
      }))
    };
  }

  private parseStringArray(value: string): string[] {
    const parsed = this.parseJsonArray(value);
    return parsed.filter((item): item is string => typeof item === "string");
  }

  private parseJsonArray(value: string): unknown[] {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private parseJsonObject(value: string): Record<string, unknown> {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }

  private parseJsonObjectFromText(value: string): Record<string, unknown> | undefined {
    const start = value.indexOf("{");
    const end = value.lastIndexOf("}");
    if (start < 0 || end <= start) {
      return undefined;
    }

    try {
      const parsed = JSON.parse(value.slice(start, end + 1)) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return undefined;
    }

    return undefined;
  }

  private parseStringArrayFromUnknown(value: unknown): string[] | undefined {
    if (!Array.isArray(value)) {
      return undefined;
    }

    const parsed = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
    return parsed.length > 0 ? parsed : undefined;
  }

  private readLatestCollectionValues(record: CaiplSessionRecord, targetOperation: string): Record<string, unknown> {
    const notes = [...record.notebook].reverse();
    for (const artefact of notes) {
      if (!artefact.content || typeof artefact.content !== "object" || Array.isArray(artefact.content)) {
        continue;
      }

      const content = artefact.content as Record<string, unknown>;
      if (content["type"] !== "field_collection_state") {
        continue;
      }

      if (content["operation"] !== targetOperation) {
        continue;
      }

      const values = content["values"];
      if (values && typeof values === "object" && !Array.isArray(values)) {
        return values as Record<string, unknown>;
      }
    }

    return {};
  }

  private extractCollectionValuesFromMessage(operation: CollectionOperationDefinition, messageText: string): Record<string, unknown> {
    const values: Record<string, unknown> = {};
    for (const field of operation.fields) {
      const extracted = extractFieldValue(field.id, messageText);
      if (hasValue(extracted)) {
        values[field.id] = extracted;
      }
    }

    return values;
  }

  private extractContextFromNodeMetadata(metadata?: Record<string, unknown>): LinaInteractionContext {
    if (!metadata) {
      return {};
    }

    const roleContext = typeof metadata["roleContext"] === "string" ? metadata["roleContext"] : undefined;
    const modeCandidate = metadata["mode"];
    const mode =
      modeCandidate === "create" ||
      modeCandidate === "select" ||
      modeCandidate === "investigate" ||
      modeCandidate === "fix" ||
      modeCandidate === "advance"
        ? modeCandidate
        : undefined;

    return { roleContext, mode };
  }

  private resolveInteractionContext(
    record: CaiplSessionRecord,
    override?: LinaInteractionContext
  ): LinaInteractionContext {
    const fromRootNode = this.extractContextFromNodeMetadata(record.planGraph.nodes[0]?.metadata);

    return {
      roleContext: override?.roleContext ?? record.session.roleContext ?? fromRootNode.roleContext,
      mode: override?.mode ?? record.session.mode ?? fromRootNode.mode
    };
  }

  private async generateAssistantResponse(
    record: CaiplSessionRecord,
    userMessage: string,
    interactionContext: LinaInteractionContext
  ): Promise<{
    response: string;
    reasoning: string;
    decisionDescription?: string;
    collectionHints?: {
      requiredFields?: string[];
      resolvedFields?: string[];
      missingFields?: string[];
      recommendedNextOperation?: string;
    };
  }> {
    const recentTurns = record.turns.slice(-8).map((turn) => `${turn.actor.toUpperCase()}: ${turn.messageText}`).join("\n");
    const pendingDecision = record.decisions.find((item) => item.status === "pending");
    const executionReceipts = this.summarizeExecutionReceipts(record);
    const hasExecutionReceipt = executionReceipts.length > 0;

    try {
      const llmText = await this.llm.chat([
        {
          role: "system",
          content:
            "You are the CAIPL assistant for Constitutional ERP. Be concise and proactive. Treat O2C, P2P, R2R, H2R, INV, and PROJ as domain processes with cross-domain data dependencies. Prefer lookup and selection from system-held values before asking users for manual entry. Ask only for unresolved fields, and never ask users to choose arbitrary question buckets. When key data is missing, ask 1-3 targeted questions that unblock the next executable step. Never claim an ERP write operation completed unless an execution receipt exists. Output JSON only with keys response, reasoningSummary, decisionDescription, requiredFields, resolvedFields, missingFields, recommendedNextOperation."
        },
        {
          role: "user",
          content: [
            `Goal: ${record.session.currentGoal}`,
            `Role context: ${interactionContext.roleContext ?? "unspecified"}`,
            `Mode context: ${interactionContext.mode ?? "unspecified"}`,
            pendingDecision
              ? `Active decision: ${pendingDecision.type} [${pendingDecision.status}]`
              : "Active decision: none",
            `Execution receipts: ${JSON.stringify(executionReceipts)}`,
            "Conversation so far:",
            recentTurns || "none",
            `Latest user message: ${userMessage}`,
            "Return JSON with keys: response (string), reasoningSummary (string), decisionDescription (string), requiredFields (string[]), resolvedFields (string[]), missingFields (string[]), recommendedNextOperation (string)."
          ].join("\n")
        }
      ]);

      const parsed = this.parseJsonObjectFromText(llmText);
      const response =
        parsed && typeof parsed["response"] === "string" && parsed["response"].trim().length > 0
          ? String(parsed["response"]).trim()
          : llmText.trim();
      const groundedResponse = this.enforceExecutionGrounding(response, hasExecutionReceipt);

      const reasoning =
        parsed && typeof parsed["reasoningSummary"] === "string"
          ? String(parsed["reasoningSummary"]).trim()
          : "Reasoning summary unavailable; raw assistant response used.";

      const decisionDescription =
        parsed && typeof parsed["decisionDescription"] === "string"
          ? String(parsed["decisionDescription"]).trim()
          : undefined;

      const collectionHints = parsed
        ? {
            requiredFields: this.parseStringArrayFromUnknown(parsed["requiredFields"]),
            resolvedFields: this.parseStringArrayFromUnknown(parsed["resolvedFields"]),
            missingFields: this.parseStringArrayFromUnknown(parsed["missingFields"]),
            recommendedNextOperation:
              typeof parsed["recommendedNextOperation"] === "string"
                ? String(parsed["recommendedNextOperation"]).trim()
                : undefined
          }
        : undefined;

      return {
        response: groundedResponse,
        reasoning,
        decisionDescription,
        collectionHints
      };
    } catch (error) {
      const fallbackReason = error instanceof Error ? error.message : "Unknown LLM error";
      return {
        response:
          "I could not complete the model reasoning step right now. Please retry your request or refine your goal statement.",
        reasoning: `LLM call failed: ${fallbackReason}`
      };
    }
  }
}
