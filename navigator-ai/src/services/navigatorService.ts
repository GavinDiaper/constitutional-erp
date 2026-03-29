import { AuthorityClient } from "../clients/authorityClient";
import { CepClient } from "../clients/cepClient";
import { GovernanceClient } from "../clients/governanceClient";
import { IntegrationHubClient } from "../clients/integrationHubClient";
import { ActionOption, DecisionOutcome, NavigatorContext, RankedAction, SessionContext, SimulationResult } from "../contracts/navigatorTypes";
import { listNavigatorEvents, recordGovernanceOutcome, recordNavigatorEvent, recordRanking, recordSimulation } from "../domain/stores/navigatorStore";
import { LlmClient } from "../llm/types";
import { decide } from "./decisionEngine";
import { executeDecision } from "./executor";
import { explainDecision } from "./explainer";
import { interpretHypermedia } from "./interpreter";
import { rankActions } from "./ranker";
import { simulateAction } from "./simulator";

export class NavigatorService {
  constructor(
    private readonly integrationHubClient: IntegrationHubClient,
    private readonly authorityClient: AuthorityClient,
    private readonly governanceClient: GovernanceClient,
    private readonly cepClient: CepClient,
    private readonly llmClient: LlmClient
  ) {}

  async getResource(ctx: SessionContext) {
    return this.integrationHubClient.getResource(ctx);
  }

  async buildContext(ctx: SessionContext): Promise<NavigatorContext> {
    const resource = await this.integrationHubClient.getResource(ctx);
    const actionOptions = interpretHypermedia(resource, ctx);
    const recentHistory = await this.cepClient.getHistory({
      domain: ctx.domain,
      aggregateType: ctx.aggregateType,
      aggregateId: ctx.aggregateId,
      limit: 50
    });

    return {
      resource,
      actionOptions,
      actorId: ctx.actorId,
      recentHistory,
      riskProfile: {
        hasApprovalActions: actionOptions.some((a) => a.requiresApproval)
      }
    };
  }

  async rank(ctx: SessionContext): Promise<{ context: NavigatorContext; rankedActions: RankedAction[] }> {
    const context = await this.buildContext(ctx);
    const rankedActions = await rankActions(context, this.llmClient);
    recordRanking(ctx, rankedActions, rankedActions[0]?.actionId);

    recordNavigatorEvent({
      eventType: "Navigator.ActionRecommended",
      domain: ctx.domain,
      aggregateType: ctx.aggregateType,
      aggregateId: ctx.aggregateId,
      actorId: ctx.actorId,
      payload: { rankedActions }
    });

    await this.cepClient.publish({
      eventType: "Navigator.ActionRecommended",
      actorId: ctx.actorId,
      domain: ctx.domain,
      aggregateType: ctx.aggregateType,
      aggregateId: ctx.aggregateId,
      payload: { rankedActions }
    });

    return { context, rankedActions };
  }

  async explain(ctx: SessionContext, actionId?: string): Promise<string> {
    const { context, rankedActions } = await this.rank(ctx);
    const chosenAction = actionId
      ? rankedActions.find((a) => a.actionId === actionId) ?? rankedActions[0]
      : rankedActions[0];

    if (!chosenAction) {
      return "No action available to explain.";
    }

    const decision = await decide({
      context,
      rankedActions,
      authorityClient: this.authorityClient,
      governanceClient: this.governanceClient
    });

    const explanation = await explainDecision({
      context,
      chosenAction,
      governance: decision,
      llm: this.llmClient
    });

    recordNavigatorEvent({
      eventType: "Navigator.ExplanationGenerated",
      domain: ctx.domain,
      aggregateType: ctx.aggregateType,
      aggregateId: ctx.aggregateId,
      actorId: ctx.actorId,
      payload: { actionId: chosenAction.actionId, explanation }
    });

    await this.cepClient.publish({
      eventType: "Navigator.ExplanationGenerated",
      actorId: ctx.actorId,
      domain: ctx.domain,
      aggregateType: ctx.aggregateType,
      aggregateId: ctx.aggregateId,
      payload: { actionId: chosenAction.actionId, explanation }
    });

    return explanation;
  }

  async simulate(ctx: SessionContext, actionId: string): Promise<SimulationResult> {
    const context = await this.buildContext(ctx);
    const action = context.actionOptions.find((candidate) => candidate.id === actionId);
    if (!action) {
      throw new Error(`Unknown action '${actionId}' for aggregate`);
    }

    const result = await simulateAction(context, action, this.llmClient);
    recordSimulation(ctx, actionId, result);

    recordNavigatorEvent({
      eventType: "Navigator.SimulationRun",
      domain: ctx.domain,
      aggregateType: ctx.aggregateType,
      aggregateId: ctx.aggregateId,
      actorId: ctx.actorId,
      payload: { actionId, result }
    });

    await this.cepClient.publish({
      eventType: "Navigator.SimulationRun",
      actorId: ctx.actorId,
      domain: ctx.domain,
      aggregateType: ctx.aggregateType,
      aggregateId: ctx.aggregateId,
      payload: { actionId, result }
    });

    return result;
  }

  async decide(ctx: SessionContext): Promise<DecisionOutcome> {
    const { context, rankedActions } = await this.rank(ctx);
    const outcome = await decide({
      context,
      rankedActions,
      authorityClient: this.authorityClient,
      governanceClient: this.governanceClient
    });

    recordGovernanceOutcome(ctx, outcome.action?.actionId ?? null, outcome);
    return outcome;
  }

  async execute(ctx: SessionContext, actionId?: string) {
    let decision: DecisionOutcome;

    if (actionId) {
      const { rankedActions } = await this.rank(ctx);
      const picked = rankedActions.find((item) => item.actionId === actionId);
      decision = {
        action: picked ?? { actionId, score: 0.5, rationale: "Action selected by operator." },
        mode: "EXECUTE",
        explanation: "Action forced by operator command."
      };
    } else {
      decision = await this.decide(ctx);
    }

    return executeDecision({
      context: ctx,
      decision,
      integrationHubClient: this.integrationHubClient,
      cepClient: this.cepClient
    });
  }

  async history(ctx: SessionContext, limit = 100): Promise<Array<Record<string, unknown>>> {
    return this.cepClient.getHistory({
      domain: ctx.domain,
      aggregateType: ctx.aggregateType,
      aggregateId: ctx.aggregateId,
      limit
    });
  }

  async navlog(ctx: SessionContext, limit = 100) {
    return listNavigatorEvents(ctx.domain, ctx.aggregateType, ctx.aggregateId, limit);
  }

  async actions(ctx: SessionContext): Promise<ActionOption[]> {
    const resource = await this.integrationHubClient.getResource(ctx);
    return interpretHypermedia(resource, ctx);
  }
}
