import assert from "node:assert/strict";
import test from "node:test";
import request from "supertest";
import { BackendAdapter } from "../src/adapters/types";
import { AdapterRegistry } from "../src/adapters/registry";
import { createApp } from "../src/app";
import { loadConfig } from "../src/config/env";
import { AuthorityCheckResult, GovernanceCheckResult } from "../src/domain/types";

const app = createApp();
const config = loadConfig();

function buildAuthorityClient(health = true) {
  return {
    health: async () => health,
    check: async (): Promise<AuthorityCheckResult> => ({
      allowed: true,
      effectiveTier: 2,
      requiredTier: 1,
      reasons: []
    }),
    getEligibleApprovers: async () => ["EMP-777"]
  };
}

function buildGovernanceClient(
  health = true,
  evaluateFn?: (input: { action: string }) => Promise<GovernanceCheckResult>
) {
  return {
    health: async () => health,
    evaluate: evaluateFn ?? (async (input: { action: string }): Promise<GovernanceCheckResult> => {
      if (input.action === "cancel") {
        return {
          allowed: false,
          requiresApproval: false,
          violations: ["DeniedInTest"],
          constraints: [],
          matchedRules: []
        };
      }

      return {
        allowed: true,
        requiresApproval: false,
        violations: [],
        constraints: [],
        matchedRules: []
      };
    })
  };
}

function buildAdapter(input: {
  id: string;
  canHandle: (meshPath: string) => boolean;
  health: boolean;
  onFetch?: () => void;
  onExecute?: (meshPath: string) => void;
}): BackendAdapter {
  return {
    id: input.id,
    canHandle: input.canHandle,
    health: async () => input.health,
    fetchResource: async (_meshPath) => {
      input.onFetch?.();
      return {
        status: 200,
        resource: {
          id: "PO-1",
          domain: "P2P",
          type: "purchase-orders",
          attributes: {
            requesterId: "EMP-123",
            amount: 1000,
            supplierId: "SUP-1"
          },
          links: {
            approve: {
              href: "/mesh/p2p/purchase-orders/PO-1/approve",
              method: "POST"
            },
            cancel: {
              href: "/mesh/p2p/purchase-orders/PO-1/cancel",
              method: "POST"
            }
          }
        }
      };
    },
    executeAction: async (meshPath) => {
      input.onExecute?.(meshPath);
      return { status: 200, data: { ok: true, meshPath } };
    }
  };
}

test("GET /health returns mesh service status", async () => {
  const response = await request(app).get("/health");

  assert.equal(response.status, 200);
  assert.equal(response.body.status, "ok");
  assert.equal(response.body.service, "mesh-gateway");
});

test("GET /mesh/p2p/purchase-orders/PO-1 rejects missing api key", async () => {
  const response = await request(app).get("/mesh/p2p/purchase-orders/PO-1");

  assert.equal(response.status, 401);
  assert.equal(response.body.title, "unauthorized");
});

test("GET /mesh/p2p/purchase-orders/PO-1 rejects missing actor header", async () => {
  const response = await request(app)
    .get("/mesh/p2p/purchase-orders/PO-1")
    .set("x-api-key", config.apiKey);

  assert.equal(response.status, 400);
  assert.equal(response.body.title, "missing_actor");
});

test("GET /mesh uses first matching adapter and returns canonical links without _links", async () => {
  let firstAdapterFetches = 0;
  let secondAdapterFetches = 0;

  const firstAdapter = buildAdapter({
    id: "foundation",
    canHandle: () => true,
    health: true,
    onFetch: () => {
      firstAdapterFetches += 1;
    }
  });

  const secondAdapter = buildAdapter({
    id: "future-sap",
    canHandle: () => true,
    health: true,
    onFetch: () => {
      secondAdapterFetches += 1;
    }
  });

  const appWithStubs = createApp({
    authorityClient: buildAuthorityClient() as unknown as never,
    governanceClient: buildGovernanceClient() as unknown as never,
    adapterRegistry: new AdapterRegistry([firstAdapter, secondAdapter])
  });

  const response = await request(appWithStubs)
    .get("/mesh/p2p/purchase-orders/PO-1")
    .set("x-api-key", config.apiKey)
    .set("x-actor-id", "EMP-123");

  assert.equal(response.status, 200);
  assert.equal(firstAdapterFetches, 1);
  assert.equal(secondAdapterFetches, 0);
  assert.ok(response.body.links);
  assert.equal(response.body._links, undefined);
  assert.ok(response.body.links.approve);
  assert.equal(response.body.links.cancel, undefined);
});

test("GET /mesh/ready returns 503 when all adapters are unhealthy", async () => {
  const unhealthyAdapter = buildAdapter({
    id: "foundation",
    canHandle: () => true,
    health: false
  });

  const appWithUnhealthyDeps = createApp({
    authorityClient: buildAuthorityClient(true) as unknown as never,
    governanceClient: buildGovernanceClient(true) as unknown as never,
    adapterRegistry: new AdapterRegistry([unhealthyAdapter])
  });

  const response = await request(appWithUnhealthyDeps).get("/mesh/ready");

  assert.equal(response.status, 503);
  assert.equal(response.body.ready, false);
  assert.deepEqual(response.body.adapters, [{ id: "foundation", healthy: false }]);
});

test("GET /mesh/ready returns 200 when at least one adapter is healthy", async () => {
  const unhealthy = buildAdapter({
    id: "foundation",
    canHandle: () => true,
    health: false
  });
  const healthy = buildAdapter({
    id: "sap-future",
    canHandle: () => false,
    health: true
  });

  const appWithMixedAdapterHealth = createApp({
    authorityClient: buildAuthorityClient(true) as unknown as never,
    governanceClient: buildGovernanceClient(true) as unknown as never,
    adapterRegistry: new AdapterRegistry([unhealthy, healthy])
  });

  const response = await request(appWithMixedAdapterHealth).get("/mesh/ready");

  assert.equal(response.status, 200);
  assert.equal(response.body.ready, true);
  assert.deepEqual(response.body.adapters, [
    { id: "foundation", healthy: false },
    { id: "sap-future", healthy: true }
  ]);
});

test("POST /mesh action executes via adapter on allow", async () => {
  const executedPaths: string[] = [];
  const adapter = buildAdapter({
    id: "foundation",
    canHandle: () => true,
    health: true,
    onExecute: (meshPath) => {
      executedPaths.push(meshPath);
    }
  });

  const appWithStubs = createApp({
    authorityClient: buildAuthorityClient() as unknown as never,
    governanceClient: buildGovernanceClient(true) as unknown as never,
    adapterRegistry: new AdapterRegistry([adapter])
  });

  const response = await request(appWithStubs)
    .post("/mesh/p2p/purchase-orders/PO-1/approve")
    .set("x-api-key", config.apiKey)
    .set("x-actor-id", "EMP-123")
    .send({ notes: "ok" });

  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.deepEqual(executedPaths, ["/mesh/p2p/purchase-orders/PO-1/approve"]);
});

test("POST /mesh action returns 403 and does not execute adapter on deny", async () => {
  const executedPaths: string[] = [];
  const adapter = buildAdapter({
    id: "foundation",
    canHandle: () => true,
    health: true,
    onExecute: (meshPath) => {
      executedPaths.push(meshPath);
    }
  });

  const appWithStubs = createApp({
    authorityClient: buildAuthorityClient() as unknown as never,
    governanceClient: buildGovernanceClient(true) as unknown as never,
    adapterRegistry: new AdapterRegistry([adapter])
  });

  const response = await request(appWithStubs)
    .post("/mesh/p2p/purchase-orders/PO-1/cancel")
    .set("x-api-key", config.apiKey)
    .set("x-actor-id", "EMP-123")
    .send({ notes: "deny" });

  assert.equal(response.status, 403);
  assert.equal(response.body.title, "action_denied");
  assert.deepEqual(executedPaths, []);
});

test("POST /mesh action returns 202 with task details when approval is required", async () => {
  const authorityStub = {
    ...buildAuthorityClient(),
    getEligibleApprovers: async (domain: string, tier: number) => {
      assert.equal(domain, "P2P");
      assert.equal(tier, 3);
      return ["EMP-777", "EMP-888"];
    }
  };

  const governanceStub = buildGovernanceClient(true, async () => ({
    allowed: true,
    requiresApproval: true,
    requiredApproverTier: 3,
    violations: [],
    constraints: [],
    matchedRules: []
  }));

  const appWithStubs = createApp({
    authorityClient: authorityStub as unknown as never,
    governanceClient: governanceStub as unknown as never,
    adapterRegistry: new AdapterRegistry([
      buildAdapter({ id: "foundation", canHandle: () => true, health: true })
    ])
  });

  const response = await request(appWithStubs)
    .post("/mesh/p2p/purchase-orders/PO-77/approve")
    .set("x-api-key", config.apiKey)
    .set("x-actor-id", "EMP-123")
    .send({ notes: "needs review" });

  assert.equal(response.status, 202);
  assert.equal(response.body.status, "PENDING");
  assert.equal(response.body.requiredTier, 3);
  assert.deepEqual(response.body.approvers, ["EMP-777", "EMP-888"]);
  assert.ok(typeof response.body.taskId === "string");
  assert.ok(typeof response.body.requestFingerprint === "string");
});

test("Approval replay uses stored adapter id and meshActionPath for execution", async () => {
  let handleEnabled = true;
  const executedPaths: string[] = [];

  const adapter = buildAdapter({
    id: "foundation",
    canHandle: () => handleEnabled,
    health: true,
    onExecute: (meshPath) => {
      executedPaths.push(meshPath);
    }
  });

  let evaluateCount = 0;
  const governanceStub = buildGovernanceClient(true, async () => {
    evaluateCount += 1;
    if (evaluateCount === 1) {
      return {
        allowed: true,
        requiresApproval: true,
        requiredApproverTier: 3,
        violations: [],
        constraints: [],
        matchedRules: []
      };
    }

    return {
      allowed: true,
      requiresApproval: false,
      violations: [],
      constraints: [],
      matchedRules: []
    };
  });

  const appWithStubs = createApp({
    authorityClient: {
      ...buildAuthorityClient(),
      getEligibleApprovers: async () => ["EMP-777"]
    } as unknown as never,
    governanceClient: governanceStub as unknown as never,
    adapterRegistry: new AdapterRegistry([adapter])
  });

  const createResponse = await request(appWithStubs)
    .post("/mesh/p2p/purchase-orders/PO-777/approve")
    .set("x-api-key", config.apiKey)
    .set("x-actor-id", "EMP-123")
    .send({ notes: "approval needed" });

  assert.equal(createResponse.status, 202);
  const taskId = createResponse.body.taskId as string;
  assert.ok(taskId);

  handleEnabled = false;

  const approveResponse = await request(appWithStubs)
    .post(`/mesh/approvals/${taskId}/approve`)
    .set("x-api-key", config.apiKey)
    .set("x-actor-id", "EMP-777")
    .send({ notes: "approved" });

  assert.equal(approveResponse.status, 200);
  assert.equal(approveResponse.body.status, "EXECUTED");
  assert.deepEqual(executedPaths, ["/mesh/p2p/purchase-orders/PO-777/approve"]);
});
