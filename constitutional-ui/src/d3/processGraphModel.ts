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
  transitions: Array<
    ProcessTransition & { available: boolean; invokeAction: string }
  >;
  currentState: string;
  currentStateIndex: number;
}

export interface FallbackAction {
  label: string;
  invokeAction: string;
}

const ACTION_ALIASES: Record<string, string[]> = {
  send_quote: ["send"],
  accept_quote: ["accept"],
  convert_quote_to_order: ["convertToOrder", "convert"],
  confirm_order: ["confirm"],
  allocate_stock: ["allocate"],
  ship_order: ["ship"],
  post_invoice: ["post"],
  apply_payment_to_invoice: ["apply", "applyPayment"],
  reconcile_payment: ["reconcile", "reconcilePayment"],
  submit_requisition: ["submit"],
  approve_requisition: ["approve"],
  convert_requisition_to_po: ["convertToPO", "convert"],
  issue_po: ["issue"],
  acknowledge_po: ["acknowledge"],
  post_journal: ["post"],
  place_on_leave: ["goOnLeave", "leave"],
  return_from_leave: ["returnFromLeave", "return"],
  terminate_employee: ["terminate"],
};

ACTION_ALIASES.convert_quote_to_order = [
  ...ACTION_ALIASES.convert_quote_to_order,
  "convert-to-order",
];
ACTION_ALIASES.convert_requisition_to_po = [
  ...ACTION_ALIASES.convert_requisition_to_po,
  "convert-to-po",
];

const ALIAS_TO_CANONICAL = Object.entries(ACTION_ALIASES).reduce<Record<string, string>>(
  (acc, [canonical, aliases]) => {
    for (const alias of aliases) {
      if (!acc[alias]) {
        acc[alias] = canonical;
      }
    }
    return acc;
  },
  {}
);

function resolveInvokeAction(templateAction: string, availableRels: Set<string>): string | null {
  if (availableRels.has(templateAction)) {
    return templateAction;
  }

  const aliases = ACTION_ALIASES[templateAction] ?? [];
  for (const alias of aliases) {
    if (availableRels.has(alias)) {
      return alias;
    }
  }

  return null;
}

function defaultInvokeAction(templateAction: string): string {
  return templateAction;
}

export function getActionCandidates(action: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (value: string) => {
    if (!value || seen.has(value)) return;
    seen.add(value);
    out.push(value);
  };

  push(action);

  const aliases = ACTION_ALIASES[action] ?? [];
  aliases.forEach(push);

  const canonical = ALIAS_TO_CANONICAL[action];
  if (canonical) {
    push(canonical);
    (ACTION_ALIASES[canonical] ?? []).forEach(push);
  }

  return out;
}

export function getFallbackActions(
  entityType: string,
  currentState: string
): FallbackAction[] {
  const tpl = PROCESS_TEMPLATES[entityType];
  if (!tpl) {
    return [];
  }

  return tpl.transitions
    .filter((t) => t.from === currentState)
    .map((t) => ({
      label: t.action,
      invokeAction: defaultInvokeAction(t.action),
    }));
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
        invokeAction: l.rel,
      })),
      currentState,
      currentStateIndex: 0,
    };
  }

  const currentStateIndex = Math.max(tpl.states.indexOf(currentState), 0);

  return {
    states: tpl.states,
    transitions: tpl.transitions.map((t) => {
      const invokeAction = resolveInvokeAction(t.action, available);
      return {
        ...t,
        available: Boolean(invokeAction),
        invokeAction: invokeAction ?? defaultInvokeAction(t.action),
      };
    }),
    currentState,
    currentStateIndex,
  };
}
