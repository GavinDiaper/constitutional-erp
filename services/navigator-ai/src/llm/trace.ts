import { AppConfig } from "../config/env";

function truncate(value: string, maxChars: number): string {
  if (maxChars <= 0 || value.length <= maxChars) {
    return value;
  }

  return `${value.slice(0, maxChars)}...<truncated ${value.length - maxChars} chars>`;
}

export function maybeTraceLlm(
  config: AppConfig,
  phase: "request" | "response" | "error",
  payload: Record<string, unknown>
): void {
  if (!config.llmTraceStdout) {
    return;
  }

  const line = truncate(JSON.stringify(payload), config.llmTraceMaxChars);
  console.log(`[navigator-ai][llm][${phase}] ${line}`);
}
