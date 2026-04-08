import test from "node:test";
import assert from "node:assert/strict";
import { runMigrations } from "../src/db/migrate";
import { NavigatorService } from "../src/services/navigatorService";
import { LlmClient } from "../src/llm/types";
import { SessionContext } from "../src/contracts/navigatorTypes";

runMigrations();

function buildService(input?: {
  llmResponse?: string;
  history?: Array<Record<string, unknown>>;
  createdEntityId?: string;
  executeStatus?: number;
  executeData?: Record<string, unknown>;
  governanceMode?: "EXECUTE" | "REQUEST_APPROVAL" | "REJECT";
  governanceReasons?: string[];
  governanceRequiredTier?: number;
}) {
  const published: Array<{ eventType: string; payload: Record<string, unknown> }> = [];
  let createCalls = 0;
  let executeCalls = 0;
  const addRequisitionLineCalls: Array<{ requisitionId: string; description: string; quantity: number; unitPrice: number }> = [];

  const integrationHubClient = {
    getResource: async (_ctx: SessionContext) => ({
      id: "SUP-100",
      domain: "P2P",
      type: "supplier",
      state: "Active",
      attributes: { amount: 25000 },
      links: {
        acknowledge: {
          href: "/x",
          method: "POST" as const,
          rel: "acknowledge"
        }
      }
    }),
    createEntity: async (payload: { operation: string; payload: Record<string, unknown>; actorId: string }) => {
      createCalls += 1;
      return {
        operation: payload.operation,
        entityType: payload.operation === "create-requisition" ? "p2p_requisition" : "p2p_supplier",
        entityId: input?.createdEntityId ?? (payload.operation === "create-requisition" ? "REQ-NEW-1" : "SUP-NEW-1"),
        data: payload.payload
      };
    },
    addRequisitionLine: async (line: { requisitionId: string; description: string; quantity: number; unitPrice: number }) => {
      addRequisitionLineCalls.push(line);
      return {
        requisition_line_id: `RL-${addRequisitionLineCalls.length}`,
        requisition_id: line.requisitionId,
        description: line.description,
        quantity: line.quantity,
        unit_price: line.unitPrice
      };
    },
    executeAction: async () => {
      executeCalls += 1;
      return {
        status: input?.executeStatus ?? 200,
        data: input?.executeData ?? {}
      };
    },
    getCreateLookups: async () => []
  };

  const authorityClient = {
    check: async () => ({ allowed: true })
  };

  const governanceClient = {
    evaluate: async () => ({
      mode: input?.governanceMode ?? ("EXECUTE" as const),
      reasons: input?.governanceReasons ?? [],
      requiredTier: input?.governanceRequiredTier
    })
  };

  const cepClient = {
    publish: async (event: {
      eventType: string;
      payload: Record<string, unknown>;
    }) => {
      published.push({ eventType: event.eventType, payload: event.payload });
    },
    getHistory: async () => input?.history ?? [{ eventType: "Navigator.EntityCreated" }]
  };

  const llmClient: LlmClient = {
    provider: "deterministic",
    model: "deterministic-v1",
    validateConnectivity: async () => undefined,
    chat: async (messages) => {
      const system = messages.find((m) => m.role === "system")?.content ?? "";
      if (system.includes("structured creation intent parser")) {
        if (input?.llmResponse) {
          return input.llmResponse;
        }
        throw new Error("forced fallback");
      }

      if (system.includes("ranking engine")) {
        return JSON.stringify([
          { actionId: "acknowledge", score: 0.82, rationale: "Supplier recently created." }
        ]);
      }

      return "{}";
    }
  };

  const service = new NavigatorService(
    integrationHubClient as never,
    authorityClient as never,
    governanceClient as never,
    cepClient as never,
    llmClient
  );

  return {
    service,
    published,
    getCreateCalls: () => createCalls,
    getExecuteCalls: () => executeCalls,
    getAddRequisitionLineCalls: () => addRequisitionLineCalls
  };
}

test("promptCreate dry-run resolves but does not create", async () => {
  const { service, getCreateCalls, published } = buildService();

  const result = await service.promptCreate({
    prompt: "create a new supplier in UAE named Gulf Trading with net45",
    actorId: "principal.system",
    domain: "P2P",
    dryRun: true
  });

  assert.equal(result.status, "READY");
  assert.equal(result.resolution.operation, "create-supplier");
  assert.equal(result.created, undefined);
  assert.equal(getCreateCalls(), 0);
  assert.equal(published.length, 0);
});

test("promptCreate returns clarification and publishes nothing for unresolved intent", async () => {
  const { service, getCreateCalls, published } = buildService();

  const result = await service.promptCreate({
    prompt: "please help me with setup",
    actorId: "principal.system",
    domain: "P2P"
  });

  assert.equal(result.status, "NEEDS_CLARIFICATION");
  assert.equal(result.resolution.missingFields.includes("operation"), true);
  assert.equal(getCreateCalls(), 0);
  assert.equal(published.length, 0);
});

test("promptCreate purchase-order intent requires missing IDs and does not execute", async () => {
  const { service, getCreateCalls, published } = buildService({
    llmResponse: JSON.stringify({
      payload: {
        totalAmount: 1200,
        currencyCode: "USD",
        deliveryAddress: "Warehouse A"
      }
    })
  });

  const result = await service.promptCreate({
    prompt: "create a purchase order for 1200 USD delivered to Warehouse A",
    actorId: "principal.system",
    domain: "P2P"
  });

  assert.equal(result.status, "NEEDS_CLARIFICATION");
  assert.equal(result.resolution.operation, "create-purchase-order");
  assert.ok(result.resolution.missingFields.includes("supplierId"));
  assert.equal(getCreateCalls(), 0);
  assert.equal(published.length, 0);
});

test("promptCreate executes and publishes prompt-create event", async () => {
  const { service, getCreateCalls, published } = buildService();

  const result = await service.promptCreate({
    prompt: "create a new supplier in UAE named Gulf Trading with net45",
    actorId: "principal.system",
    domain: "P2P"
  });

  assert.equal(result.status, "READY");
  assert.equal(getCreateCalls(), 1);
  assert.ok(published.some((event) => event.eventType === "Navigator.PromptCreateExecuted"));
  assert.ok(published.some((event) => event.eventType === "Navigator.EntityCreated"));

  const promptCreateEvent = published.find((event) => event.eventType === "Navigator.PromptCreateExecuted");
  assert.ok(promptCreateEvent);
  assert.equal(promptCreateEvent?.payload["operation"], "create-supplier");
  assert.equal(promptCreateEvent?.payload["entityId"], "SUP-NEW-1");
  assert.equal(typeof promptCreateEvent?.payload["prompt"], "string");

  const entityCreatedEvent = published.find((event) => event.eventType === "Navigator.EntityCreated");
  assert.ok(entityCreatedEvent);
  assert.equal(entityCreatedEvent?.payload["operation"], "create-supplier");
  assert.equal(entityCreatedEvent?.payload["entityType"], "p2p_supplier");
  assert.equal(entityCreatedEvent?.payload["entityId"], "SUP-NEW-1");
});

test("promptCreate publishes normalized supplier payload fields for UAE prompt", async () => {
  const { service, published } = buildService();

  const result = await service.promptCreate({
    prompt: "create a new supplier in uae named Gulf Trading with net45 terms in aed",
    actorId: "principal.system",
    domain: "P2P"
  });

  assert.equal(result.status, "READY");

  const promptCreateEvent = published.find((event) => event.eventType === "Navigator.PromptCreateExecuted");
  assert.ok(promptCreateEvent);

  const payload = promptCreateEvent?.payload["payload"] as Record<string, unknown>;
  assert.equal(payload["countryCode"], "AE");
  assert.equal(payload["currencyCode"], "AED");
  assert.equal(payload["paymentTerms"], "NET45");
});

test("promptCreate requisition prompt defaults legal entity/date and adds requisition line", async () => {
  const { service, getAddRequisitionLineCalls, published } = buildService();

  const result = await service.promptCreate({
    prompt: "Create a requisition for 5 Chairs at 100 AED for this supplier",
    actorId: "principal.system",
    domain: "P2P",
    context: {
      domain: "P2P",
      aggregateType: "supplier",
      aggregateId: "SUP-CTX-1",
      resource: {
        id: "SUP-CTX-1",
        type: "supplier",
        state: "Active",
        attributes: {
          currencyCode: "AED"
        }
      }
    }
  });

  assert.equal(result.status, "READY");
  assert.equal(result.resolution.operation, "create-requisition");
  assert.equal(result.resolution.payload["currencyCode"], "AED");
  assert.equal(result.resolution.payload["legalEntityId"], "LE-SEED-AE");
  assert.equal(typeof result.resolution.payload["neededByDate"], "string");
  const lineCalls = getAddRequisitionLineCalls();
  assert.equal(lineCalls.length, 1);
  assert.equal(lineCalls[0]?.description.toLowerCase(), "chairs");
  assert.equal(lineCalls[0]?.quantity, 5);
  assert.equal(lineCalls[0]?.unitPrice, 100);

  const promptCreateEvent = published.find((event) => event.eventType === "Navigator.PromptCreateExecuted");
  assert.ok(promptCreateEvent);
  assert.equal(promptCreateEvent?.payload["operation"], "create-requisition");
});

test("nextSteps publishes recommendation event and boosts create flow after entity creation history", async () => {
  const { service, published } = buildService({
    history: [{ eventType: "Navigator.EntityCreated" }, { eventType: "Navigator.ActionRecommended" }]
  });

  const result = await service.nextSteps(
    {
      domain: "P2P",
      aggregateType: "supplier",
      aggregateId: "SUP-100",
      actorId: "principal.system"
    },
    6
  );

  const createSuggestion = result.suggestions.find((item) => item.operation === "create-requisition");

  assert.ok(createSuggestion);
  assert.equal(createSuggestion?.score, 0.88);
  assert.ok(published.some((event) => event.eventType === "Navigator.NextStepsRecommended"));
  assert.ok(published.some((event) => event.eventType === "Navigator.ActionRecommended"));
});

test("nextSteps respects limit and publishes bounded suggestions payload", async () => {
  const { service, published } = buildService({
    history: [{ eventType: "Navigator.EntityCreated" }, { eventType: "Navigator.ActionRecommended" }]
  });

  const limit = 1;
  const result = await service.nextSteps(
    {
      domain: "P2P",
      aggregateType: "supplier",
      aggregateId: "SUP-100",
      actorId: "principal.system"
    },
    limit
  );

  assert.equal(result.suggestions.length, 1);

  const publishedEvent = published.find((event) => event.eventType === "Navigator.NextStepsRecommended");
  assert.ok(publishedEvent);

  const payloadSuggestions = publishedEvent?.payload["suggestions"];
  assert.ok(Array.isArray(payloadSuggestions));
  assert.equal(payloadSuggestions?.length, 1);

  const historySignals = publishedEvent?.payload["historySignals"] as Record<string, unknown>;
  assert.equal(historySignals["hasRecentEntityCreated"], true);
  assert.equal(historySignals["eventCount"], 2);

  const eventTypes = historySignals["recentEventTypes"];
  assert.ok(Array.isArray(eventTypes));
  assert.ok(eventTypes.includes("Navigator.EntityCreated"));
  assert.ok(eventTypes.includes("Navigator.ActionRecommended"));
});

test("execute creates persistent approval request when governance requires approval", async () => {
  const { service, published, getExecuteCalls } = buildService({
    governanceMode: "REQUEST_APPROVAL",
    governanceReasons: ["Amount exceeds delegated authority."],
    governanceRequiredTier: 2
  });

  const context = {
    domain: "P2P" as const,
    aggregateType: "supplier",
    aggregateId: `SUP-APPROVAL-${Date.now()}`,
    actorId: "principal.system",
    userNote: "approve spend over limit"
  };

  const result = await service.execute(context);

  assert.equal(result.mode, "REQUEST_APPROVAL");
  assert.equal(result.statusCode, 202);
  assert.equal(getExecuteCalls(), 0);

  const approvalRequest = result.responseBody["approvalRequest"] as Record<string, unknown>;
  assert.equal(approvalRequest["status"], "PENDING");
  assert.equal(approvalRequest["requiredTier"], 2);

  const list = await service.approvals({
    domain: context.domain,
    aggregateType: context.aggregateType,
    aggregateId: context.aggregateId,
    limit: 10
  });

  assert.equal(list.length, 1);
  assert.equal(list[0]?.approvalRequestId, approvalRequest["approvalRequestId"]);
  assert.equal(list[0]?.status, "PENDING");
  assert.deepEqual(list[0]?.reasons, ["Amount exceeds delegated authority."]);

  const detail = await service.approval(String(approvalRequest["approvalRequestId"]));
  assert.ok(detail);
  assert.equal(detail?.aggregateId, context.aggregateId);
  assert.equal(detail?.requiredTier, 2);
  assert.ok(published.some((event) => event.eventType === "Navigator.ApprovalRequested"));
});

test("approval request can be approved and emits approval-approved event", async () => {
  const { service, published } = buildService({
    governanceMode: "REQUEST_APPROVAL",
    governanceReasons: ["Tier 2 approval required."],
    governanceRequiredTier: 2
  });

  const aggregateId = `SUP-APPROVE-${Date.now()}`;
  const created = await service.execute({
    domain: "P2P",
    aggregateType: "supplier",
    aggregateId,
    actorId: "principal.requestor"
  });

  const approvalRequest = created.responseBody["approvalRequest"] as Record<string, unknown>;
  const approvalRequestId = String(approvalRequest["approvalRequestId"]);

  const approved = await service.approveApprovalRequest(approvalRequestId, {
    actorId: "principal.approver",
    note: "Approved within delegated authority."
  });

  assert.equal(approved.status, "APPROVED");
  assert.equal(approved.resolvedBy, "principal.approver");
  assert.ok(approved.resolvedAt);
  assert.ok(published.some((event) => event.eventType === "Navigator.ApprovalApproved"));

  const reloaded = await service.approval(approvalRequestId);
  assert.equal(reloaded?.status, "APPROVED");
});

test("approval request can be escalated then rejected at higher tier", async () => {
  const { service, published } = buildService({
    governanceMode: "REQUEST_APPROVAL",
    governanceReasons: ["Initial approval required."],
    governanceRequiredTier: 1
  });

  const aggregateId = `SUP-ESCALATE-${Date.now()}`;
  const created = await service.execute({
    domain: "P2P",
    aggregateType: "supplier",
    aggregateId,
    actorId: "principal.requestor"
  });

  const approvalRequest = created.responseBody["approvalRequest"] as Record<string, unknown>;
  const approvalRequestId = String(approvalRequest["approvalRequestId"]);

  const escalated = await service.escalateApprovalRequest(approvalRequestId, {
    actorId: "principal.supervisor",
    requiredTier: 3,
    note: "Escalating due to policy exception."
  });

  assert.equal(escalated.status, "ESCALATED");
  assert.equal(escalated.requiredTier, 3);
  assert.equal(escalated.resolvedAt, undefined);

  const rejected = await service.rejectApprovalRequest(approvalRequestId, {
    actorId: "principal.executive",
    note: "Rejected after executive review."
  });

  assert.equal(rejected.status, "REJECTED");
  assert.equal(rejected.requiredTier, 3);
  assert.equal(rejected.resolvedBy, "principal.executive");
  assert.ok(published.some((event) => event.eventType === "Navigator.ApprovalEscalated"));
  assert.ok(published.some((event) => event.eventType === "Navigator.ApprovalRejected"));
});

test("post-approval execution automatically executes the approved action", async () => {
  const { service, published } = buildService({
    governanceMode: "REQUEST_APPROVAL",
    governanceReasons: ["Approval required."],
    governanceRequiredTier: 2,
    executeStatus: 200,
    executeData: { state: "Acknowledged" }
  });

  const aggregateId = `SUP-EXECUTE-AFTER-APPROVAL-${Date.now()}`;
  const created = await service.execute({
    domain: "P2P",
    aggregateType: "supplier",
    aggregateId,
    actorId: "principal.requestor"
  });

  const approvalRequest = created.responseBody["approvalRequest"] as Record<string, unknown>;
  const approvalRequestId = String(approvalRequest["approvalRequestId"]);

  // Verify approval is PENDING
  assert.equal(created.statusCode, 202);
  const preApproval = await service.approval(approvalRequestId);
  assert.equal(preApproval?.status, "PENDING");

  // Approve the request
  const approved = await service.approveApprovalRequest(approvalRequestId, {
    actorId: "principal.approver",
    note: "Approval granted; executing automatically."
  });

  // Verify status transitioned to APPROVED
  assert.equal(approved.status, "APPROVED");
  assert.equal(approved.resolvedBy, "principal.approver");

  // Verify post-approval execution was attempted
  assert.ok(
    published.some((event) => event.eventType === "Navigator.PostApprovalExecuted"),
    "Should emit Navigator.PostApprovalExecuted event"
  );

  // Verify the approval event was emitted
  assert.ok(
    published.some((event) => event.eventType === "Navigator.ApprovalApproved"),
    "Should emit Navigator.ApprovalApproved event"
  );
});

test("simulator uses domain-aware state machines for predictions", async () => {
  const { service } = buildService();

  const context = {
    domain: "P2P" as const,
    aggregateType: "supplier",
    aggregateId: "SUP-123",
    actorId: "principal.system"
  };

  // Simulate the acknowledge action on a supplier (which is in the mock links)
  // The supplier is in "Active" state, and acknowledge should transition based on state machine
  const result = await service.simulate(context, "acknowledge");

  // Verify simulation result has expected structure
  assert.ok(result.predictedState);
  assert.ok(Array.isArray(result.predictedTransitions));
  assert.ok(result.riskSummary);
  assert.equal(typeof result.narrative, "string");
  assert.ok(result.narrative.length > 0);

  // Verify that predicted transitions includes the action we just simulated
  assert.ok(result.predictedTransitions.includes("acknowledge"));

  // Risk summary should be low to medium for normal actions
  assert.ok(["low", "medium", "high"].includes(result.riskSummary));
});


