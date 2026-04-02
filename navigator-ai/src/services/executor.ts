import { CepClient } from "../clients/cepClient";
import { IntegrationHubClient } from "../clients/integrationHubClient";
import { DecisionOutcome, ExecutionResult, SessionContext } from "../contracts/navigatorTypes";
import { recordExecution, recordNavigatorEvent } from "../domain/stores/navigatorStore";

export async function executeDecision(input: {
  context: SessionContext;
  decision: DecisionOutcome;
  integrationHubClient: IntegrationHubClient;
  cepClient: CepClient;
}): Promise<ExecutionResult> {
  const actionId = input.decision.action?.actionId;
  if (!actionId) {
    return {
      mode: "NO_ACTION",
      actionId: "",
      statusCode: 204,
      responseBody: {
        detail: "No action selected"
      }
    };
  }

  if (input.decision.mode === "REJECT") {
    const denied: ExecutionResult = {
      mode: "REJECT",
      actionId,
      statusCode: 403,
      responseBody: {
        detail: input.decision.explanation
      }
    };

    recordExecution(input.context, actionId, denied);
    recordNavigatorEvent({
      eventType: "Navigator.ActionDenied",
      domain: input.context.domain,
      aggregateType: input.context.aggregateType,
      aggregateId: input.context.aggregateId,
      actorId: input.context.actorId,
      payload: denied.responseBody
    });

    await input.cepClient.publish({
      eventType: "Navigator.ActionDenied",
      actorId: input.context.actorId,
      domain: input.context.domain,
      aggregateType: input.context.aggregateType,
      aggregateId: input.context.aggregateId,
      payload: denied.responseBody
    });

    return denied;
  }

  const result = await input.integrationHubClient.executeAction({
    aggregateType: input.context.aggregateType,
    aggregateId: input.context.aggregateId,
    actionId,
    actorId: input.context.actorId,
    payload: {}
  });

  const mode =
    result.status === 202
      ? "REQUEST_APPROVAL"
      : result.status >= 200 && result.status < 300
        ? "EXECUTE"
        : "REJECT";

  const executionResult: ExecutionResult = {
    mode,
    actionId,
    statusCode: result.status,
    responseBody: result.data
  };

  recordExecution(input.context, actionId, executionResult);

  const eventType =
    mode === "REQUEST_APPROVAL"
      ? "Navigator.ApprovalRequested"
      : mode === "EXECUTE"
        ? "Navigator.ActionExecuted"
        : "Navigator.ActionFailed";

  recordNavigatorEvent({
    eventType,
    domain: input.context.domain,
    aggregateType: input.context.aggregateType,
    aggregateId: input.context.aggregateId,
    actorId: input.context.actorId,
    payload: executionResult.responseBody
  });

  await input.cepClient.publish({
    eventType,
    actorId: input.context.actorId,
    domain: input.context.domain,
    aggregateType: input.context.aggregateType,
    aggregateId: input.context.aggregateId,
    payload: executionResult.responseBody
  });

  return executionResult;
}
