import type { ProcessLink } from "../api/processApi";

export interface ProcessTransition {
  from: string;
  to: string;
  action: string;
}

export interface ProcessTemplate {
  states: string[];
  transitions: ProcessTransition[];
}

const PROCESS_TEMPLATES: Record<string, ProcessTemplate> = {
  quote: {
    states: ["Draft", "Sent", "Accepted", "ConvertedToOrder"],
    transitions: [
      { from: "Draft", to: "Sent", action: "send_quote" },
      { from: "Sent", to: "Accepted", action: "accept_quote" },
      { from: "Accepted", to: "ConvertedToOrder", action: "convert_quote_to_order" },
    ],
  },
  "sales-order": {
    states: ["Draft", "Confirmed", "Allocated", "Shipped"],
    transitions: [
      { from: "Draft", to: "Confirmed", action: "confirm_order" },
      { from: "Confirmed", to: "Allocated", action: "allocate_stock" },
      { from: "Allocated", to: "Shipped", action: "ship_order" },
    ],
  },
  "ar-invoice": {
    states: ["Draft", "Posted"],
    transitions: [{ from: "Draft", to: "Posted", action: "post_invoice" }],
  },
  "ar-payment": {
    states: ["Received", "Applied", "Reconciled"],
    transitions: [
      { from: "Received", to: "Applied", action: "apply_payment_to_invoice" },
      { from: "Applied", to: "Reconciled", action: "reconcile_payment" },
    ],
  },
  requisition: {
    states: ["Draft", "Submitted", "Approved", "ConvertedToPO"],
    transitions: [
      { from: "Draft", to: "Submitted", action: "submit_requisition" },
      { from: "Submitted", to: "Approved", action: "approve_requisition" },
      { from: "Approved", to: "ConvertedToPO", action: "convert_requisition_to_po" },
    ],
  },
  supplier: {
    states: ["Active"],
    transitions: [],
  },
  "purchase-order": {
    states: ["Draft", "Issued", "Acknowledged"],
    transitions: [
      { from: "Draft", to: "Issued", action: "issue_po" },
      { from: "Issued", to: "Acknowledged", action: "acknowledge_po" },
    ],
  },
  journal: {
    states: ["Draft", "Posted"],
    transitions: [{ from: "Draft", to: "Posted", action: "post_journal" }],
  },
  employee: {
    states: ["Active", "OnLeave", "Terminated"],
    transitions: [
      { from: "Active", to: "OnLeave", action: "place_on_leave" },
      { from: "OnLeave", to: "Active", action: "return_from_leave" },
      { from: "Active", to: "Terminated", action: "terminate_employee" },
      { from: "OnLeave", to: "Terminated", action: "terminate_employee" },
    ],
  },
};

export interface ProcessGraphViewModel {
  states: string[];
  transitions: Array<ProcessTransition & { available: boolean }>;
  currentState: string;
  currentStateIndex: number;
}

export function buildProcessGraphModel(
  entityType: string,
  currentState: string,
  links: ProcessLink[]
): ProcessGraphViewModel {
  const tpl = PROCESS_TEMPLATES[entityType];
  const available = new Set(links.map((l) => l.rel));

  if (!tpl) {
    return {
      states: [currentState],
      transitions: links.map((l) => ({
        from: currentState,
        to: currentState,
        action: l.rel,
        available: true,
      })),
      currentState,
      currentStateIndex: 0,
    };
  }

  const currentStateIndex = Math.max(tpl.states.indexOf(currentState), 0);

  return {
    states: tpl.states,
    transitions: tpl.transitions.map((t) => ({
      ...t,
      available: available.has(t.action),
    })),
    currentState,
    currentStateIndex,
  };
}
