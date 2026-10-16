import { createHash, randomUUID } from "node:crypto";
import { AppConfig } from "../config/env";
import { recordLlmInteraction } from "../domain/stores/navigatorStore";
import { HttpError } from "../utils/errors";
import { LlmClient, LlmMessage } from "./types";
import { maybeTraceLlm } from "./trace";

const MAX_QUEUED = 4;

function hashContext(messages: LlmMessage[]): string {
  return createHash("sha256").update(JSON.stringify(messages)).digest("hex");
}

export class OllamaClient implements LlmClient {
  readonly provider = "ollama" as const;
  private tail: Promise<unknown> = Promise.resolve();
  private pending = 0;

  constructor(private readonly config: AppConfig) {}

  get model(): string {
    return this.config.ollamaModel;
  }

  // Ollama's native API lives beside the /v1 OpenAI-compatible path.
  private get nativeBaseUrl(): string {
    return this.config.ollamaBaseUrl.replace(/\/v1$/, "");
  }

  async validateConnectivity(): Promise<void> {
    let response: Response;
    try {
      response = await fetch(`${this.nativeBaseUrl}/api/tags`, { signal: AbortSignal.timeout(10000) });
    } catch (error) {
      throw new HttpError(502, "llm_unavailable", `Ollama unreachable: ${(error as Error).message}`);
    }
    if (!response.ok) {
      throw new HttpError(502, "llm_unavailable", `Ollama health check failed: ${response.status}`);
    }
    const body = (await response.json()) as { models?: Array<{ name?: string; model?: string }> };
    const wanted = this.model.includes(":") ? this.model : `${this.model}:latest`;
    const found = (body.models ?? []).some((m) => (m.name ?? m.model) === wanted);
    if (!found) {
      throw new HttpError(502, "llm_unavailable", `Ollama model not found: ${this.model}`);
    }
  }

  // CPU inference handles one request at a time; excess requests wait, then are rejected when the queue is full.
  async chat(messages: LlmMessage[]): Promise<string> {
    if (this.pending >= MAX_QUEUED) {
      throw new HttpError(503, "llm_busy", "Local model is busy; try again shortly");
    }
    this.pending += 1;
    const run = this.tail.then(() => this.execute(messages));
    this.tail = run.catch(() => undefined);
    try {
      return await run;
    } finally {
      this.pending -= 1;
    }
  }

  private async execute(messages: LlmMessage[]): Promise<string> {
    const url = `${this.config.ollamaBaseUrl}/chat/completions`;
    const payload = {
      model: this.model,
      messages,
      temperature: 0,
      max_tokens: this.config.ollamaMaxTokens
    };

    maybeTraceLlm(this.config, "request", { provider: this.provider, model: this.model, url, payload });

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.config.ollamaTimeoutMs)
      });
    } catch (error) {
      const message = (error as Error).message;
      maybeTraceLlm(this.config, "error", { provider: this.provider, model: this.model, error: message });
      throw new HttpError(502, "llm_unavailable", `Ollama call failed: ${message}`);
    }

    if (!response.ok) {
      const text = await response.text();
      maybeTraceLlm(this.config, "error", {
        provider: this.provider,
        model: this.model,
        status: response.status,
        error: text
      });
      throw new HttpError(502, "llm_unavailable", `Ollama call failed: ${text}`);
    }

    const body = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    maybeTraceLlm(this.config, "response", { provider: this.provider, model: this.model, body });

    const content = body.choices?.[0]?.message?.content;
    if (!content) {
      throw new HttpError(502, "llm_invalid_response", "Ollama returned an empty response");
    }

    recordLlmInteraction({
      id: randomUUID(),
      kind: "chat",
      model: `${this.provider}:${this.model}`,
      promptJson: JSON.stringify(payload),
      responseText: content,
      contextHash: hashContext(messages)
    });

    return content;
  }
}
