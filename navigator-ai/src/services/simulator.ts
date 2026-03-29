import { ActionOption, NavigatorContext, SimulationResult } from "../contracts/navigatorTypes";
import { LlmClient } from "../llm/types";

function predictState(actionId: string, currentState: string): string {
  const map: Record<string, string> = {
    submit: "Submitted",
    approve: "Approved",
    reject: "Rejected",
    issue: "Issued",
    acknowledge: "Acknowledged",
    cancel: "Cancelled",
    close: "Closed",
    reopen: "Reopened"
  };

  return map[actionId] ?? currentState;
}

export async function simulateAction(
  context: NavigatorContext,
  action: ActionOption,
  llm: LlmClient
): Promise<SimulationResult> {
  const predictedState = predictState(action.id, context.resource.state);
  const highValue = action.riskSignals["highValue"] === true;
  const riskSummary = action.requiresApproval || highValue ? "elevated" : "low";

  const narrative = await llm.chat([
    {
      role: "system",
      content: "You are a business simulator. Keep output short and grounded."
    },
    {
      role: "user",
      content: [
        `Domain: ${context.resource.domain}`,
        `Current state: ${context.resource.state}`,
        `Action: ${action.id}`,
        `Predicted state: ${predictedState}`,
        `Risk summary: ${riskSummary}`,
        "Describe likely business impact in 1-2 sentences."
      ].join("\n")
    }
  ]);

  const impact = typeof context.resource.attributes["amount"] === "number" ? (context.resource.attributes["amount"] as number) : undefined;

  return {
    predictedState,
    predictedTransitions: [action.id],
    riskSummary,
    financialImpact: impact,
    narrative: narrative.trim()
  };
}
