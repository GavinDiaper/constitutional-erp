import { DecisionOutcome, NavigatorContext, RankedAction } from "../contracts/navigatorTypes";
import { AzureOpenAiClient } from "../llm/azureOpenAiClient";

export async function explainDecision(input: {
  context: NavigatorContext;
  chosenAction: RankedAction;
  governance: DecisionOutcome;
  llm: AzureOpenAiClient;
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
        `Governance mode: ${input.governance.mode}`,
        `Governance explanation: ${input.governance.explanation}`,
        "Provide a concise explanation for operators."
      ].join("\n")
    }
  ]);

  return response.trim();
}
