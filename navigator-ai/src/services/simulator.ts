import { ActionOption, NavigatorContext, SessionContext, SimulationResult } from "../contracts/navigatorTypes";
import { LlmClient } from "../llm/types";

interface DomainStateTransition {
  currentState: string;
  actions: Array<{ actionId: string; nextState: string; requiresApproval: boolean; riskLevel: "low" | "medium" | "high" }>;
}

interface DomainStateMachine {
  states: string[];
  transitions: Record<string, DomainStateTransition>;
}

// Domain-aware state machines based on canonical ERP processes
const domainStateMachines: Record<string, Record<string, DomainStateMachine>> = {
  P2P: {
    "supplier": {
      states: ["Active", "Inactive", "OnHold", "Deactivated"],
      transitions: {
        "Active": {
          currentState: "Active",
          actions: [
            { actionId: "edit", nextState: "Active", requiresApproval: false, riskLevel: "low" },
            { actionId: "hold", nextState: "OnHold", requiresApproval: true, riskLevel: "medium" },
            { actionId: "deactivate", nextState: "Deactivated", requiresApproval: true, riskLevel: "high" }
          ]
        },
        "OnHold": {
          currentState: "OnHold",
          actions: [
            { actionId: "resume", nextState: "Active", requiresApproval: false, riskLevel: "low" },
            { actionId: "deactivate", nextState: "Deactivated", requiresApproval: true, riskLevel: "medium" }
          ]
        },
        "Deactivated": {
          currentState: "Deactivated",
          actions: [
            { actionId: "reactivate", nextState: "Active", requiresApproval: true, riskLevel: "medium" }
          ]
        }
      }
    },
    "requisition": {
      states: ["Draft", "Submitted", "Approved", "Rejected", "PO-Created", "Cancelled"],
      transitions: {
        "Draft": {
          currentState: "Draft",
          actions: [
            { actionId: "submit", nextState: "Submitted", requiresApproval: false, riskLevel: "low" },
            { actionId: "cancel", nextState: "Cancelled", requiresApproval: false, riskLevel: "low" }
          ]
        },
        "Submitted": {
          currentState: "Submitted",
          actions: [
            { actionId: "approve", nextState: "Approved", requiresApproval: true, riskLevel: "medium" },
            { actionId: "reject", nextState: "Rejected", requiresApproval: true, riskLevel: "medium" },
            { actionId: "revise", nextState: "Draft", requiresApproval: false, riskLevel: "low" }
          ]
        },
        "Approved": {
          currentState: "Approved",
          actions: [
            { actionId: "create-po", nextState: "PO-Created", requiresApproval: false, riskLevel: "low" },
            { actionId: "cancel", nextState: "Cancelled", requiresApproval: true, riskLevel: "medium" }
          ]
        },
        "Rejected": {
          currentState: "Rejected",
          actions: [
            { actionId: "revise", nextState: "Draft", requiresApproval: false, riskLevel: "low" }
          ]
        },
        "PO-Created": {
          currentState: "PO-Created",
          actions: []
        },
        "Cancelled": {
          currentState: "Cancelled",
          actions: []
        }
      }
    },
    "purchase-order": {
      states: ["Draft", "Issued", "Acknowledged", "FullyReceived", "FullyInvoiced", "Cancelled", "Closed"],
      transitions: {
        "Draft": {
          currentState: "Draft",
          actions: [
            { actionId: "issue", nextState: "Issued", requiresApproval: true, riskLevel: "medium" },
            { actionId: "cancel", nextState: "Cancelled", requiresApproval: false, riskLevel: "low" }
          ]
        },
        "Issued": {
          currentState: "Issued",
          actions: [
            { actionId: "acknowledge", nextState: "Acknowledged", requiresApproval: false, riskLevel: "low" },
            { actionId: "cancel", nextState: "Cancelled", requiresApproval: true, riskLevel: "high" }
          ]
        },
        "Acknowledged": {
          currentState: "Acknowledged",
          actions: [
            { actionId: "receive", nextState: "FullyReceived", requiresApproval: false, riskLevel: "low" },
            { actionId: "cancel", nextState: "Cancelled", requiresApproval: true, riskLevel: "high" }
          ]
        },
        "FullyReceived": {
          currentState: "FullyReceived",
          actions: [
            { actionId: "invoice", nextState: "FullyInvoiced", requiresApproval: false, riskLevel: "low" },
            { actionId: "close", nextState: "Closed", requiresApproval: false, riskLevel: "low" }
          ]
        },
        "FullyInvoiced": {
          currentState: "FullyInvoiced",
          actions: [
            { actionId: "close", nextState: "Closed", requiresApproval: false, riskLevel: "low" }
          ]
        },
        "Cancelled": {
          currentState: "Cancelled",
          actions: []
        },
        "Closed": {
          currentState: "Closed",
          actions: []
        }
      }
    }
  },
  O2C: {
    "invoice": {
      states: ["Draft", "Posted", "Paid", "WriteOff", "Disputed", "Closed"],
      transitions: {
        "Draft": {
          currentState: "Draft",
          actions: [
            { actionId: "post", nextState: "Posted", requiresApproval: true, riskLevel: "medium" }
          ]
        },
        "Posted": {
          currentState: "Posted",
          actions: [
            { actionId: "apply-payment", nextState: "Paid", requiresApproval: false, riskLevel: "low" },
            { actionId: "dispute", nextState: "Disputed", requiresApproval: false, riskLevel: "low" },
            { actionId: "write-off", nextState: "WriteOff", requiresApproval: true, riskLevel: "high" }
          ]
        },
        "Paid": {
          currentState: "Paid",
          actions: [
            { actionId: "close", nextState: "Closed", requiresApproval: false, riskLevel: "low" }
          ]
        },
        "Disputed": {
          currentState: "Disputed",
          actions: [
            { actionId: "resolve", nextState: "Posted", requiresApproval: true, riskLevel: "medium" }
          ]
        },
        "WriteOff": {
          currentState: "WriteOff",
          actions: [
            { actionId: "close", nextState: "Closed", requiresApproval: true, riskLevel: "medium" }
          ]
        },
        "Closed": {
          currentState: "Closed",
          actions: []
        }
      }
    }
  },
  R2R: {
    "fiscal-year": {
      states: ["Open", "Closed"],
      transitions: {
        "Open": {
          currentState: "Open",
          actions: [
            { actionId: "close", nextState: "Closed", requiresApproval: true, riskLevel: "high" }
          ]
        },
        "Closed": {
          currentState: "Closed",
          actions: [
            { actionId: "reopen", nextState: "Open", requiresApproval: true, riskLevel: "high" }
          ]
        }
      }
    },
    "fiscal-period": {
      states: ["Open", "Closed"],
      transitions: {
        "Open": {
          currentState: "Open",
          actions: [
            { actionId: "close", nextState: "Closed", requiresApproval: true, riskLevel: "high" }
          ]
        },
        "Closed": {
          currentState: "Closed",
          actions: [
            { actionId: "reopen", nextState: "Open", requiresApproval: true, riskLevel: "high" }
          ]
        }
      }
    }
  },
  H2R: {
    "employee": {
      states: ["Active", "OnLeave", "Inactive"],
      transitions: {
        "Active": {
          currentState: "Active",
          actions: [
            { actionId: "deactivate", nextState: "Inactive", requiresApproval: true, riskLevel: "medium" }
          ]
        },
        "OnLeave": {
          currentState: "OnLeave",
          actions: [
            { actionId: "return", nextState: "Active", requiresApproval: false, riskLevel: "low" }
          ]
        },
        "Inactive": {
          currentState: "Inactive",
          actions: [
            { actionId: "reactivate", nextState: "Active", requiresApproval: true, riskLevel: "medium" }
          ]
        }
      }
    }
  }
};

function getStateMachine(domain: SessionContext["domain"], aggregateType: string): DomainStateMachine | undefined {
  return domainStateMachines[domain]?.[aggregateType];
}

function predictStateUsingMachine(
  domain: SessionContext["domain"],
  aggregateType: string,
  currentState: string,
  actionId: string
): { nextState: string; valid: boolean; riskLevel: "low" | "medium" | "high" } {
  const machine = getStateMachine(domain, aggregateType);
  if (!machine) {
    // Fallback if no machine defined for this domain/type
    return { nextState: currentState, valid: true, riskLevel: "low" };
  }

  const stateTransition = machine.transitions[currentState];
  if (!stateTransition) {
    // Current state not in machine
    return { nextState: currentState, valid: false, riskLevel: "low" };
  }

  const action = stateTransition.actions.find((a) => a.actionId === actionId);
  if (!action) {
    // Action not valid from this state
    return { nextState: currentState, valid: false, riskLevel: "low" };
  }

  return { nextState: action.nextState, valid: true, riskLevel: action.riskLevel };
}

export async function simulateAction(
  context: NavigatorContext,
  action: ActionOption,
  llm: LlmClient
): Promise<SimulationResult> {
  // Use domain-aware state machine to predict state
  const stateTransition = predictStateUsingMachine(
    context.resource.domain as SessionContext["domain"],
    context.resource.type,
    context.resource.state,
    action.id
  );

  const predictedState = stateTransition.nextState;
  const isValidTransition = stateTransition.valid;

  // Determine risk based on:
  // 1. Whether this is a valid state transition
  // 2. Domain-specific risk level
  // 3. Whether action requires approval
  let riskSummary = stateTransition.riskLevel;
  if (!isValidTransition) {
    riskSummary = "high"; // Invalid transitions are risky
  } else if (action.requiresApproval && riskSummary === "low") {
    riskSummary = "medium"; // Approval-required actions are at least medium risk
  }

  // Compute predicted transitions: what actions become available after this one?
  const predictedTransitions = [action.id];
  if (isValidTransition) {
    const machine = getStateMachine(
      context.resource.domain as SessionContext["domain"],
      context.resource.type
    );
    if (machine) {
      const nextStateTransitions = machine.transitions[predictedState];
      if (nextStateTransitions) {
        predictedTransitions.push(
          ...nextStateTransitions.actions.map((a) => a.actionId)
        );
      }
    }
  }

  // Generate narrative using LLM with more context
  const narrative = await llm.chat([
    {
      role: "system",
      content: "You are a business process simulator. Provide realistic, grounded impact analysis."
    },
    {
      role: "user",
      content: [
        `Domain: ${context.resource.domain} (${context.resource.type})`,
        `Current state: ${context.resource.state}`,
        `Action: ${action.id}`,
        `Predicted state: ${predictedState}`,
        `Valid transition: ${isValidTransition}`,
        `Risk level: ${riskSummary}`,
        `Requires approval: ${action.requiresApproval}`,
        context.userNote ? `Operator note: ${context.userNote}` : undefined,
        context.recentHistory && context.recentHistory.length > 0 
          ? `Recent activity: ${context.recentHistory.length} events in last period` 
          : undefined,
        "Describe the business impact of this action in 1-2 sentences. Focus on: workflow progression, approval gates ahead, financial or operational risks."
      ].filter(Boolean).join("\n")
    }
  ]);

  const impact = typeof context.resource.attributes["amount"] === "number" ? (context.resource.attributes["amount"] as number) : undefined;

  return {
    predictedState: isValidTransition ? predictedState : context.resource.state,
    predictedTransitions,
    riskSummary,
    financialImpact: impact,
    narrative: narrative.trim()
  };
}
