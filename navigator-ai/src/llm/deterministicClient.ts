import { createHash, randomUUID } from "node:crypto";
import { AppConfig } from "../config/env";
import { recordLlmInteraction } from "../domain/stores/navigatorStore";
import { LlmClient, LlmMessage } from "./types";

function hashContext(messages: LlmMessage[]): string {
  const digest = createHash("sha256");
  digest.update(JSON.stringify(messages));
  return digest.digest("hex");
}

function stableScore(seed: string, text: string): number {
  const digest = createHash("sha256");
  digest.update(seed);
  digest.update("|");
  digest.update(text);
  const hex = digest.digest("hex").slice(0, 8);
  const value = parseInt(hex, 16) / 0xffffffff;
  return Math.max(0.05, Math.min(0.99, Number((0.25 + value * 0.7).toFixed(3))));
}

function lineValue(block: string, label: string): string | undefined {
  const match = block.match(new RegExp(`^${label}:\\s*(.+)$`, "mi"));
  return match?.[1]?.trim();
}

function buildRankedActions(seed: string, userContent: string): string {
  const available = lineValue(userContent, "Available actions") ?? "";
  const aggregate = lineValue(userContent, "Aggregate") ?? "unknown/unknown";
  const actor = lineValue(userContent, "Actor") ?? "system";
  const actions = available
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  const ranked = actions
    .map((actionId) => ({
      actionId,
      score: stableScore(seed, `${aggregate}|${actor}|${actionId}`),
      rationale: `Deterministic score from offline policy seed for ${actionId}.`
    }))
    .sort((a, b) => b.score - a.score);

  return JSON.stringify(ranked, null, 2);
}

function buildExplanation(userContent: string): string {
  const action = lineValue(userContent, "Action") ?? "unknown-action";
  const state = lineValue(userContent, "State") ?? "Unknown";
  const mode = lineValue(userContent, "Governance mode") ?? "EXECUTE";
  const governance = lineValue(userContent, "Governance explanation") ?? "No governance details provided.";
  return `Deterministic constitutional explanation: in state ${state}, action ${action} is assessed under mode ${mode}. Governance outcome: ${governance}`;
}

function buildSimulation(userContent: string): string {
  const action = lineValue(userContent, "Action") ?? "unknown-action";
  const predictedState = lineValue(userContent, "Predicted state") ?? "Unknown";
  const risk = lineValue(userContent, "Risk summary") ?? "low";
  return `Deterministic simulation indicates action ${action} transitions to ${predictedState} with ${risk} constitutional friction.`;
}

export class DeterministicClient implements LlmClient {
  readonly provider = "deterministic" as const;

  constructor(private readonly config: AppConfig) {}

  get model(): string {
    return "deterministic-v1";
  }

  async validateConnectivity(): Promise<void> {
    return;
  }

  async chat(messages: LlmMessage[]): Promise<string> {
    const system = messages.find((msg) => msg.role === "system")?.content ?? "";
    const userContent = messages.find((msg) => msg.role === "user")?.content ?? "";

    let responseText: string;
    if (system.includes("health check endpoint")) {
      responseText = "ok";
    } else if (system.includes("ranking engine")) {
      responseText = buildRankedActions(this.config.deterministicSeed, userContent);
    } else if (system.includes("constitutional explanation engine")) {
      responseText = buildExplanation(userContent);
    } else if (system.includes("business simulator")) {
      responseText = buildSimulation(userContent);
    } else {
      responseText = "Deterministic offline response";
    }

    recordLlmInteraction({
      id: randomUUID(),
      kind: "chat",
      model: `${this.provider}:${this.model}`,
      promptJson: JSON.stringify(messages),
      responseText,
      contextHash: hashContext(messages)
    });

    return responseText;
  }
}
