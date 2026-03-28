import { createHash, randomUUID } from "node:crypto";
import { AppConfig } from "../config/env";
import { HttpError } from "../utils/errors";
import { recordLlmInteraction } from "../domain/stores/navigatorStore";

function hashContext(messages: Array<{ role: string; content: string }>): string {
  const digest = createHash("sha256");
  digest.update(JSON.stringify(messages));
  return digest.digest("hex");
}

export class AzureOpenAiClient {
  constructor(private readonly config: AppConfig) {}

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

  async chat(messages: Array<{ role: "system" | "user" | "assistant"; content: string }>): Promise<string> {
    const url = `${this.config.azureOpenAiEndpoint}/openai/deployments/${this.config.azureOpenAiDeployment}/chat/completions?api-version=${this.config.azureOpenAiApiVersion}`;

    const payload = {
      messages,
      max_completion_tokens: this.config.azureOpenAiMaxTokens
    };

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
      throw new HttpError(502, "llm_unavailable", `Azure OpenAI call failed: ${text}`);
    }

    const body = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const content = body.choices?.[0]?.message?.content;
    if (!content) {
      throw new HttpError(502, "llm_invalid_response", "Azure OpenAI returned an empty response");
    }

    recordLlmInteraction({
      id: randomUUID(),
      kind: "chat",
      model: this.config.azureOpenAiDeployment,
      promptJson: JSON.stringify(messages),
      responseText: content,
      contextHash: hashContext(messages)
    });

    return content;
  }
}
