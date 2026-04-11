import { ActionOption, NavigatorContext, RankedAction } from "../contracts/navigatorTypes";
import { LlmClient } from "../llm/types";

export function heuristicScore(action: ActionOption): number {
  const highValue = action.riskSignals["highValue"] === true;
  const approvalPenalty = action.requiresApproval ? 0.25 : 0;
  const highValuePenalty = highValue ? 0.2 : 0;
  const base = 0.9 - approvalPenalty - highValuePenalty;
  return Math.max(0.05, Math.min(0.99, base));
}

export function normalizeRankings(actions: RankedAction[]): RankedAction[] {
  return [...actions].sort((a, b) => b.score - a.score);
}

export function historySummary(context: NavigatorContext): string {
  if (context.recentHistory.length === 0) {
    return "none";
  }

  const eventTypes = context.recentHistory
    .slice(-8)
    .map((event) => {
      const eventType = event["eventType"];
      return typeof eventType === "string" ? eventType : undefined;
    })
    .filter((eventType): eventType is string => Boolean(eventType));

  if (eventTypes.length === 0) {
    return `events=${context.recentHistory.length}; recentTypes=unknown`;
  }

  return `events=${context.recentHistory.length}; recentTypes=${eventTypes.join(", ")}`;
}

export function buildPrompt(context: NavigatorContext): string {
  return [
    `Domain: ${context.resource.domain}`,
    `Aggregate: ${context.resource.type}/${context.resource.id}`,
    `State: ${context.resource.state}`,
    `Actor: ${context.actorId}`,
    `Risk profile: ${JSON.stringify(context.riskProfile)}`,
    `Recent history: ${historySummary(context)}`,
    context.userNote ? `Operator note: ${context.userNote}` : undefined,
    `Available actions: ${context.actionOptions.map((a) => a.id).join(", ")}`,
    "Return strict JSON array of objects with fields actionId, score (0..1), rationale."
  ].filter(Boolean).join("\n");
}

export function parseRankedActions(text: string): RankedAction[] | undefined {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start < 0 || end <= start) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(text.slice(start, end + 1)) as Array<{
      actionId: string;
      score: number;
      rationale: string;
    }>;

    return parsed
      .filter((item) => item.actionId)
      .map((item) => ({
        actionId: item.actionId,
        score: Math.max(0, Math.min(1, Number(item.score) || 0.1)),
        rationale: item.rationale || "Ranked by Navigator"
      }));
  } catch {
    return undefined;
  }
}

export async function rankActions(context: NavigatorContext, llm: LlmClient): Promise<RankedAction[]> {
  const prompt = buildPrompt(context);

  const response = await llm.chat([
    {
      role: "system",
      content:
        "You are the Navigator ranking engine. Rank only among provided actions and stay grounded in provided data."
    },
    {
      role: "user",
      content: prompt
    }
  ]);

  const llmRanked = parseRankedActions(response);
  if (llmRanked && llmRanked.length > 0) {
    return normalizeRankings(llmRanked);
  }

  const fallback = context.actionOptions.map((action) => ({
    actionId: action.id,
    score: heuristicScore(action),
    rationale: action.requiresApproval
      ? "Action appears valid but likely requires governance approval."
      : "Action appears executable with low constitutional friction."
  }));

  return normalizeRankings(fallback);
}
