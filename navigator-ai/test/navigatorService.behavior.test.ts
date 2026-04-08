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
}) {
  const published: Array<{ eventType: string; payload: Record<string, unknown> }> = [];
  let createCalls = 0;

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
        entityType: "p2p_supplier",
        entityId: input?.createdEntityId ?? "SUP-NEW-1",
        data: payload.payload
      };
    },
    executeAction: async () => ({ status: 200, data: {} }),
    getCreateLookups: async () => []
  };

  const authorityClient = {
    check: async () => ({ allowed: true })
  };

  const governanceClient = {
    evaluate: async () => ({ mode: "EXECUTE" as const, reasons: [] })
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

  return { service, published, getCreateCalls: () => createCalls };
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
