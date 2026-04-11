import { CepClient } from "../clients/cepClient";
import { IntegrationHubClient } from "../clients/integrationHubClient";
import { ActionInputSchema, ActionOption, DecisionOutcome, ExecutionResult, SessionContext } from "../contracts/navigatorTypes";
import { recordApprovalRequest, recordExecution, recordNavigatorEvent } from "../domain/stores/navigatorStore";
import { LlmClient } from "../llm/types";

async function extractPayloadFromNote(input: {
  actionId: string;
  inputSchema: ActionInputSchema;
  userNote: string;
  llm: LlmClient;
}): Promise<Record<string, unknown>> {
  const schemaDescription = JSON.stringify(input.inputSchema, null, 2);

  const prompt = [
    `You are a data extraction assistant for a constitutional ERP system.`,
    `The operator wants to execute the action "${input.actionId}".`,
    `The action requires a JSON payload matching this schema:`,
    schemaDescription,
    ``,
    `The operator's note is:`,
    `"${input.userNote}"`,
    ``,
    `Extract the field values from the operator note and return ONLY a valid JSON object with the exact field names from the schema.`,
    `Convert numbers to numeric JSON values (not strings). Do not include any explanation or markdown, only raw JSON.`
  ].join("\n");

  const response = await input.llm.chat([
    {
      role: "system",
      content: "You are a structured data extraction engine. Respond with only valid JSON. No markdown, no explanation."
    },
    {
      role: "user",
      content: prompt
    }
  ]);

  // Extract the JSON object from the LLM response
  const start = response.indexOf("{");
  const end = response.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(response.slice(start, end + 1)) as Record<string, unknown>;
    } catch {
      // fall through to empty
    }
  }
  return {};
}

async function buildExecutionPayload(input: {
  actionId: string;
  userNote?: string;
  actionOptions: ActionOption[];
  llm: LlmClient;
}): Promise<Record<string, unknown>> {
  const action = input.actionOptions.find((a) => a.id === input.actionId);
  const schema = action?.inputSchema;
  const requiredFields = schema?.required ?? [];

  if (requiredFields.length > 0 && input.userNote) {
    return extractPayloadFromNote({
      actionId: input.actionId,
      inputSchema: schema!,
      userNote: input.userNote,
      llm: input.llm
    });
  }

  return {};
}

export async function executeDecision(input: {
  context: SessionContext;
  decision: DecisionOutcome;
  actionOptions: ActionOption[];
  integrationHubClient: IntegrationHubClient;
  cepClient: CepClient;
  llmClient: LlmClient;
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

  const selectedAction = input.actionOptions.find((candidate) => candidate.id === actionId);

  if (input.decision.mode === "REQUEST_APPROVAL") {
    const approvalRequest = recordApprovalRequest({
      domain: input.context.domain,
      aggregateType: input.context.aggregateType,
      aggregateId: input.context.aggregateId,
      actorId: input.context.actorId,
      actionId,
      requiredTier: input.decision.requiredTier ?? selectedAction?.requiredTier,
      reasons: input.decision.reasons ?? [input.decision.explanation],
      context: {
        userNote: input.context.userNote ?? null,
        actionId,
        currentState: selectedAction?.currentState ?? null,
        // Store complete action details for post-approval execution
        action: selectedAction ? {
          id: selectedAction.id,
          href: selectedAction.href,
          method: selectedAction.method,
          domain: selectedAction.domain,
          aggregateType: selectedAction.aggregateType,
          aggregateId: selectedAction.aggregateId,
          currentState: selectedAction.currentState,
          riskSignals: selectedAction.riskSignals,
          inputSchema: selectedAction.inputSchema
        } : null
      },
      responseBody: {
        detail: input.decision.explanation,
        mode: "REQUEST_APPROVAL"
      }
    });

    const approvalResult: ExecutionResult = {
      mode: "REQUEST_APPROVAL",
      actionId,
      statusCode: 202,
      responseBody: {
        detail: input.decision.explanation,
        approvalRequest
      }
    };

    recordExecution(input.context, actionId, approvalResult);
    recordNavigatorEvent({
      eventType: "Navigator.ApprovalRequested",
      domain: input.context.domain,
      aggregateType: input.context.aggregateType,
      aggregateId: input.context.aggregateId,
      actorId: input.context.actorId,
      payload: {
        approvalRequestId: approvalRequest.approvalRequestId,
        actionId,
        requiredTier: approvalRequest.requiredTier,
        reasons: approvalRequest.reasons,
        status: approvalRequest.status
      }
    });

    await input.cepClient.publish({
      eventType: "Navigator.ApprovalRequested",
      actorId: input.context.actorId,
      domain: input.context.domain,
      aggregateType: input.context.aggregateType,
      aggregateId: input.context.aggregateId,
      payload: {
        approvalRequestId: approvalRequest.approvalRequestId,
        actionId,
        requiredTier: approvalRequest.requiredTier,
        reasons: approvalRequest.reasons,
        status: approvalRequest.status
      }
    });

    return approvalResult;
  }

  const result = await input.integrationHubClient.executeAction({
    aggregateType: input.context.aggregateType,
    aggregateId: input.context.aggregateId,
    actionId,
    actorId: input.context.actorId,
    payload: await buildExecutionPayload({
      actionId,
      userNote: input.context.userNote,
      actionOptions: input.actionOptions,
      llm: input.llmClient
    })
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

  if (mode === "REQUEST_APPROVAL") {
    const requiredTier = typeof result.data["requiredTier"] === "number"
      ? (result.data["requiredTier"] as number)
      : selectedAction?.requiredTier;
    const detail = typeof result.data["detail"] === "string"
      ? result.data["detail"]
      : "Approval requested by integration hub.";
    const approvalRequest = recordApprovalRequest({
      domain: input.context.domain,
      aggregateType: input.context.aggregateType,
      aggregateId: input.context.aggregateId,
      actorId: input.context.actorId,
      actionId,
      requiredTier,
      reasons: [detail],
      context: {
        userNote: input.context.userNote ?? null,
        actionId,
        currentState: selectedAction?.currentState ?? null,
        // Store complete action details for post-approval execution
        action: selectedAction ? {
          id: selectedAction.id,
          href: selectedAction.href,
          method: selectedAction.method,
          domain: selectedAction.domain,
          aggregateType: selectedAction.aggregateType,
          aggregateId: selectedAction.aggregateId,
          currentState: selectedAction.currentState,
          riskSignals: selectedAction.riskSignals,
          inputSchema: selectedAction.inputSchema
        } : null
      },
      responseBody: result.data
    });

    executionResult.responseBody = {
      ...result.data,
      approvalRequest
    };
  }

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
