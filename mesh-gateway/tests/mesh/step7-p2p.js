#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..", "..");
const REPORT_DIR = path.join(ROOT, "reports", "newman");
const ENV_EXPORT = path.join(REPORT_DIR, "mesh-p2p-environment.json");

const CEP_BASE_URL = process.env.STEP7_CEP_BASE_URL || "http://localhost:4004";
const PGE_BASE_URL = process.env.STEP7_PGE_BASE_URL || "http://localhost:4005";
const SKIP_PGE = (process.env.STEP7_SKIP_PGE || "false").toLowerCase() === "true";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function runMeshP2P() {
  const script = path.join(__dirname, "run-p2p.js");
  const result = spawnSync(process.execPath, [script], {
    cwd: ROOT,
    stdio: "inherit",
    env: process.env
  });

  if (typeof result.status !== "number" || result.status !== 0) {
    throw new Error(`Mesh P2P Newman run failed with exit code ${result.status ?? "unknown"}`);
  }
}

function readExportedEnvironment() {
  assert(fs.existsSync(ENV_EXPORT), `Expected Newman environment export at ${ENV_EXPORT}`);
  const raw = fs.readFileSync(ENV_EXPORT, "utf8");
  const parsed = JSON.parse(raw);
  const values = Array.isArray(parsed.values) ? parsed.values : [];

  const map = new Map(values.map((item) => [item.key, item.value]));
  const get = (key) => String(map.get(key) ?? "");

  const apiKey = get("apiKey") || "change-me";
  const requesterActorId = get("requesterActorId") || "EMP-123";
  const requisitionId = get("requisitionId");
  const poId = get("poId");

  assert(requisitionId, "Missing requisitionId in exported Newman environment");
  assert(poId, "Missing poId in exported Newman environment");

  return { apiKey, requesterActorId, requisitionId, poId };
}

async function fetchJson(url, apiKey, extraHeaders = {}) {
  const response = await fetch(url, {
    headers: {
      "x-api-key": apiKey,
      ...extraHeaders
    }
  });

  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }

  return { response, body };
}

async function retryUntil(label, fn, options = {}) {
  const timeoutMs = options.timeoutMs ?? 45000;
  const intervalMs = options.intervalMs ?? 1500;
  const started = Date.now();
  let lastError;

  while (Date.now() - started < timeoutMs) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      await sleep(intervalMs);
    }
  }

  throw new Error(`${label} timed out after ${timeoutMs} ms: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

async function assertCepIngestion(context) {
  const { apiKey, requisitionId, poId } = context;

  const eventsResult = await retryUntil("CEP mesh event visibility", async () => {
    const { response, body } = await fetchJson(
      `${CEP_BASE_URL}/api/v1/events?sourceSystem=mesh-gateway&domain=P2P&limit=400`,
      apiKey
    );
    if (response.status !== 200) {
      throw new Error(`Unexpected status from /events: ${response.status}`);
    }

    const rows = Array.isArray(body.data) ? body.data : [];
    const hit = rows.find((row) => {
      const aggId = row?.domain?.aggregateId;
      return aggId === requisitionId || aggId === poId;
    });

    if (!hit) {
      throw new Error("No mesh-gateway ledger rows found yet for captured requisition/PO IDs");
    }

    return rows;
  });

  const statusResult = await retryUntil("CEP mesh source cursor readiness", async () => {
    const { response, body } = await fetchJson(`${CEP_BASE_URL}/api/v1/status/ingestion`, apiKey);
    if (response.status !== 200) {
      throw new Error(`Unexpected status from /status/ingestion: ${response.status}`);
    }

    const sources = Array.isArray(body.sources) ? body.sources : [];
    const mesh = sources.find((source) => source.sourceSystem === "mesh-gateway");
    if (!mesh) {
      throw new Error("mesh-gateway source cursor not present yet");
    }
    if (mesh.lastStatus !== "Ready") {
      throw new Error(`mesh-gateway cursor status is ${mesh.lastStatus}`);
    }

    return mesh;
  });

  const replay = await retryUntil("CEP replay aggregate availability", async () => {
    const { response, body } = await fetchJson(
      `${CEP_BASE_URL}/api/v1/replay/aggregate?domain=P2P&aggregateType=purchase-order&aggregateId=${encodeURIComponent(poId)}`,
      apiKey
    );
    if (response.status !== 200) {
      throw new Error(`Unexpected status from /replay/aggregate: ${response.status}`);
    }

    const stream = Array.isArray(body.data) ? body.data : [];
    if (stream.length === 0) {
      throw new Error("Empty replay stream for captured purchase order");
    }

    return stream;
  });

  return {
    meshEventCount: eventsResult.length,
    replayEventCount: replay.length,
    meshCursor: statusResult.cursor || ""
  };
}

async function assertOptionalPgeReplay(context) {
  if (SKIP_PGE) {
    return { skipped: true };
  }

  const { apiKey, requesterActorId, poId } = context;

  const graphBody = await retryUntil("PGE graph replay endpoint", async () => {
    const { response, body } = await fetchJson(
      `${PGE_BASE_URL}/graph/p2p/purchase-order/${encodeURIComponent(poId)}`,
      apiKey,
      { "x-actor-id": requesterActorId }
    );

    if (response.status !== 200) {
      throw new Error(`Unexpected status from PGE /graph: ${response.status}`);
    }

    if (!body || body.id !== poId) {
      throw new Error("PGE returned unexpected aggregate payload");
    }

    if (!body.links || !body.links.self) {
      throw new Error("PGE canonical resource missing self link");
    }

    return body;
  });

  return {
    skipped: false,
    state: String(graphBody.state || "unknown"),
    linkCount: Object.keys(graphBody.links || {}).length
  };
}

async function main() {
  console.log("\n=== Step 7 P2P: Mesh -> CEP -> PGE ===\n");

  runMeshP2P();

  const context = readExportedEnvironment();
  const cep = await assertCepIngestion(context);
  const pge = await assertOptionalPgeReplay(context);

  console.log("Step 7 P2P Summary");
  console.log(`- Captured requisitionId: ${context.requisitionId}`);
  console.log(`- Captured poId: ${context.poId}`);
  console.log(`- CEP mesh event rows observed: ${cep.meshEventCount}`);
  console.log(`- CEP replay stream size (PO): ${cep.replayEventCount}`);
  console.log(`- CEP mesh cursor: ${cep.meshCursor || "(not set)"}`);
  if (pge.skipped) {
    console.log("- PGE replay assertion: skipped (STEP7_SKIP_PGE=true)");
  } else {
    console.log(`- PGE replay assertion: passed (state=${pge.state}, links=${pge.linkCount})`);
  }

  console.log("\nStep 7 P2P completed successfully.\n");
}

main().catch((error) => {
  console.error("\nStep 7 P2P failed:\n", error instanceof Error ? error.message : error);
  process.exit(1);
});