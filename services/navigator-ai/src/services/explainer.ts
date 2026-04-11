import { DecisionOutcome, NavigatorContext, RankedAction } from "../contracts/navigatorTypes";
import { LlmClient } from "../llm/types";

export async function explainDecision(input: {
  context: NavigatorContext;
  chosenAction: RankedAction;
  governance: DecisionOutcome;
  llm: LlmClient;
}): Promise<string> {
  const response = await input.llm.chat([
    {
      role: "system",
      content:
        "You are the constitutional explanation engine. Explain only from supplied facts and do not invent rules."
    },
    {
      role: "user",
      content: [
        `Domain: ${input.context.resource.domain}`,
        `Aggregate: ${input.context.resource.type}/${input.context.resource.id}`,
        `State: ${input.context.resource.state}`,
        `Action: ${input.chosenAction.actionId}`,
        `Score: ${input.chosenAction.score}`,
        input.context.userNote ? `Operator note: ${input.context.userNote}` : undefined,
        `Governance mode: ${input.governance.mode}`,
        `Governance explanation: ${input.governance.explanation}`,
        "Provide a concise explanation for operators."
      ].filter(Boolean).join("\n")
    }
  ]);

  return response.trim();
}
