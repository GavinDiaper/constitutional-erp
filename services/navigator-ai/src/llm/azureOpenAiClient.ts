import { createHash, randomUUID } from "node:crypto";
import { AppConfig } from "../config/env";
import { HttpError } from "../utils/errors";
import { recordLlmInteraction } from "../domain/stores/navigatorStore";
import { LlmClient, LlmMessage } from "./types";
import { maybeTraceLlm } from "./trace";

function hashContext(messages: LlmMessage[]): string {
  const digest = createHash("sha256");
  digest.update(JSON.stringify(messages));
  return digest.digest("hex");
}

export class AzureOpenAiClient implements LlmClient {
  readonly provider = "azure" as const;

  constructor(private readonly config: AppConfig) {}

  get model(): string {
    return this.config.azureOpenAiDeployment;
  }

  async validateConnectivity(): Promise<void> {
    await this.chat([
      {
        role: "system",
        content: "You are a health check endpoint. Respond with exactly: ok"
      },
      {
        role: "user",
        content: "Return ok"
      }
    ]);
  }

  async chat(messages: LlmMessage[]): Promise<string> {
    const url = `${this.config.azureOpenAiEndpoint}/openai/deployments/${this.config.azureOpenAiDeployment}/chat/completions?api-version=${this.config.azureOpenAiApiVersion}`;

    const payload = {
      messages,
      max_completion_tokens: this.config.azureOpenAiMaxTokens
    };

    maybeTraceLlm(this.config, "request", {
      provider: this.provider,
      model: this.model,
      url,
      payload
    });

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "api-key": this.config.azureOpenAiApiKey
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const text = await response.text();
      maybeTraceLlm(this.config, "error", {
        provider: this.provider,
        model: this.model,
        status: response.status,
        statusText: response.statusText,
        error: text
      });
      throw new HttpError(502, "llm_unavailable", `Azure OpenAI call failed: ${text}`);
    }

    const body = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    maybeTraceLlm(this.config, "response", {
      provider: this.provider,
      model: this.model,
      status: response.status,
      body
    });

    const content = body.choices?.[0]?.message?.content;
    if (!content) {
      throw new HttpError(502, "llm_invalid_response", "Azure OpenAI returned an empty response");
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
