import assert from "node:assert/strict";
import test from "node:test";
import request from "supertest";
import { createApp } from "../src/app";
import { loadConfig } from "../src/config/env";

const app = createApp();
const config = loadConfig();

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
