import test from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../src/config/env";
import { OllamaClient } from "../src/llm/ollamaClient";
import { createLlmClient } from "../src/llm/providerFactory";

process.env.LLM_PROVIDER = "ollama";
process.env.DATABASE_PATH = ":memory:";

const realFetch = globalThis.fetch;
test.afterEach(() => {
  globalThis.fetch = realFetch;
});

test("factory returns OllamaClient with defaults", () => {
  const config = loadConfig();
  const client = createLlmClient(config);
  assert.ok(client instanceof OllamaClient);
  assert.equal(client.model, "navigator-llm");
});

test("validateConnectivity checks /api/tags for the model", async () => {
  const urls: string[] = [];
  globalThis.fetch = (async (url: string) => {
    urls.push(String(url));
    return new Response(JSON.stringify({ models: [{ name: "navigator-llm:latest" }] }));
  }) as typeof fetch;
  await new OllamaClient(loadConfig()).validateConnectivity();
  assert.equal(urls[0], "http://127.0.0.1:11434/api/tags");
});

test("validateConnectivity fails when model missing", async () => {
  globalThis.fetch = (async () => new Response(JSON.stringify({ models: [] }))) as typeof fetch;
  await assert.rejects(() => new OllamaClient(loadConfig()).validateConnectivity(), /not found/);
});

test("chat surfaces upstream errors", async () => {
  globalThis.fetch = (async () => new Response("boom", { status: 500 })) as typeof fetch;
  await assert.rejects(() => new OllamaClient(loadConfig()).chat([{ role: "user", content: "hi" }]), /Ollama call failed/);
});

test("chat rejects when queue is full", async () => {
  globalThis.fetch = (() => new Promise(() => undefined)) as typeof fetch;
  const client = new OllamaClient(loadConfig());
  for (let i = 0; i < 4; i += 1) void client.chat([{ role: "user", content: "x" }]).catch(() => undefined);
  await assert.rejects(() => client.chat([{ role: "user", content: "y" }]), /busy/);
});
