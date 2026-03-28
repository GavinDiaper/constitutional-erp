#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..", "..");
const REPORT_DIR = path.join(ROOT, "reports", "newman");

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

function runMeshScript(scriptName) {
  const script = path.join(__dirname, scriptName);
  const result = spawnSync(process.execPath, [script], {
    cwd: ROOT,
    stdio: "inherit",
    env: process.env
  });

  if (typeof result.status !== "number" || result.status !== 0) {
    throw new Error(`${scriptName} failed with exit code ${result.status ?? "unknown"}`);
  }
}

function readExportedEnvironment(fileName) {
  const filePath = path.join(REPORT_DIR, fileName);
  assert(fs.existsSync(filePath), `Expected Newman environment export at ${filePath}`);
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const values = Array.isArray(parsed.values) ? parsed.values : [];
  const map = new Map(values.map((item) => [item.key, item.value]));
  const get = (key, fallback = "") => String(map.get(key) ?? fallback);

  return {
    apiKey: get("apiKey", "change-me"),
    requesterActorId: get("requesterActorId", "EMP-123"),
    approverActorId: get("approverActorId", "EMP-456"),
    values: map
  };
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

async function assertCepIngestion(config, context) {
  const aggregateIds = config.aggregateEnvKeys.map((key) => context.values.get(key)).filter(Boolean);
  const cepAggregateId = String(context.values.get(config.cepAggregateEnvKey ?? config.pgeAggregateEnvKey) ?? "");
  const cepAggregateType = config.cepAggregateType ?? config.pgeAggregateType;

  const eventsResult = await retryUntil(`${config.domain} CEP mesh event visibility`, async () => {
    const { response, body } = await fetchJson(
      `${CEP_BASE_URL}/api/v1/events?sourceSystem=mesh-gateway&domain=${encodeURIComponent(config.domain)}&limit=400`,
      context.apiKey
    );
    if (response.status !== 200) {
      throw new Error(`Unexpected status from /events: ${response.status}`);
    }

    const rows = Array.isArray(body.data) ? body.data : [];
    const hit = rows.find((row) => aggregateIds.includes(row?.domain?.aggregateId));
    if (!hit) {
      throw new Error(`No mesh-gateway ledger rows found yet for aggregate IDs: ${aggregateIds.join(", ")}`);
    }

    return rows;
  });

  const statusResult = await retryUntil(`${config.domain} CEP mesh source cursor readiness`, async () => {
    const { response, body } = await fetchJson(`${CEP_BASE_URL}/api/v1/status/ingestion`, context.apiKey);
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

  const replay = await retryUntil(`${config.domain} CEP replay aggregate availability`, async () => {
    const { response, body } = await fetchJson(
      `${CEP_BASE_URL}/api/v1/replay/aggregate?domain=${encodeURIComponent(config.domain)}&aggregateType=${encodeURIComponent(cepAggregateType)}&aggregateId=${encodeURIComponent(cepAggregateId)}`,
      context.apiKey
    );
    if (response.status !== 200) {
      throw new Error(`Unexpected status from /replay/aggregate: ${response.status}`);
    }

    const stream = Array.isArray(body.data) ? body.data : [];
    if (stream.length === 0) {
      throw new Error(`Empty replay stream for ${cepAggregateType}/${cepAggregateId}`);
    }

    return {
      aggregateId: cepAggregateId,
      aggregateType: cepAggregateType,
      stream
    };
  });

  return {
    meshEventCount: eventsResult.length,
    replayEventCount: replay.stream.length,
    replayAggregateId: replay.aggregateId,
    replayAggregateType: replay.aggregateType,
    meshCursor: statusResult.cursor || ""
  };
}

async function assertOptionalPgeReplay(config, context) {
  if (SKIP_PGE || !config.pgeAggregateType || !config.pgeAggregateEnvKey) {
    return { skipped: true, reason: config.pgeSkipReason || "not configured" };
  }

  const aggregateId = String(context.values.get(config.pgeAggregateEnvKey) ?? "");

  const graphBody = await retryUntil(`${config.domain} PGE graph replay endpoint`, async () => {
    const { response, body } = await fetchJson(
      `${PGE_BASE_URL}/graph/${config.domain.toLowerCase()}/${encodeURIComponent(config.pgeAggregateType)}/${encodeURIComponent(aggregateId)}`,
      context.apiKey,
      { "x-actor-id": context.requesterActorId }
    );

    if (response.status !== 200) {
      throw new Error(`Unexpected status from PGE /graph: ${response.status}`);
    }

    if (!body || body.id !== aggregateId) {
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
    linkCount: Object.keys(graphBody.links || {}).length,
    aggregateId
  };
}

async function runStep7(config) {
  console.log(`\n=== Step 7 ${config.domain}: Mesh -> CEP -> PGE ===\n`);

  runMeshScript(config.runnerScript);
  const context = readExportedEnvironment(config.environmentExport);

  for (const key of config.requiredEnvKeys) {
    assert(context.values.get(key), `Missing ${key} in exported Newman environment`);
  }

  const cep = await assertCepIngestion(config, context);
  const pge = await assertOptionalPgeReplay(config, context);

  console.log(`Step 7 ${config.domain} Summary`);
  for (const key of config.summaryEnvKeys) {
    console.log(`- Captured ${key}: ${context.values.get(key)}`);
  }
  console.log(`- CEP mesh event rows observed: ${cep.meshEventCount}`);
  console.log(`- CEP replay stream size (${cep.replayAggregateType}/${cep.replayAggregateId}): ${cep.replayEventCount}`);
  console.log(`- CEP mesh cursor: ${cep.meshCursor || "(not set)"}`);
  if (pge.skipped) {
    console.log(`- PGE replay assertion: skipped (${pge.reason || "STEP7_SKIP_PGE=true"})`);
  } else {
    console.log(`- PGE replay assertion: passed (aggregate=${pge.aggregateId}, state=${pge.state}, links=${pge.linkCount})`);
  }

  console.log(`\nStep 7 ${config.domain} completed successfully.\n`);
}

module.exports = { runStep7 };