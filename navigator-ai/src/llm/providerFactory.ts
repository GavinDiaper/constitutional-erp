import { AppConfig } from "../config/env";
import { AzureOpenAiClient } from "./azureOpenAiClient";
import { DeterministicClient } from "./deterministicClient";
import { OpenAiClient } from "./openAiClient";
import { LlmClient } from "./types";

export function createLlmClient(config: AppConfig): LlmClient {
  switch (config.llmProvider) {
    case "deterministic":
      return new DeterministicClient(config);
    case "openai":
      return new OpenAiClient(config);
    case "azure":
    default:
      return new AzureOpenAiClient(config);
  }
}
