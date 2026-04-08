import { AuthorityClient } from "../clients/authorityClient";
import { CepClient } from "../clients/cepClient";
import { GovernanceClient } from "../clients/governanceClient";
import { IntegrationHubClient } from "../clients/integrationHubClient";
import {
  ActionOption,
  ApprovalRequestRecord,
  ApprovalResolutionInput,
  ApprovalRequestStatus,
  CreateEntityResult,
  DecisionOutcome,
  NextStepResult,
  NextStepSuggestion,
  NavigatorContext,
  NavigatorCreateOperation,
  NavigatorLookupKind,
  PromptCreateRequest,
  PromptCreateResolution,
  PromptCreateResult,
  RankedAction,
  SessionContext,
  SimulationResult
} from "../contracts/navigatorTypes";
import { getApprovalRequest, listApprovalRequests, listNavigatorEvents, recordApprovalRequest, recordGovernanceOutcome, recordNavigatorEvent, recordRanking, recordSimulation } from "../domain/stores/navigatorStore";
import { updateApprovalRequest } from "../domain/stores/navigatorStore";
import { LlmClient } from "../llm/types";
import { HttpError } from "../utils/errors";
import { decide } from "./decisionEngine";
import { executeDecision } from "./executor";
import { explainDecision } from "./explainer";
import { interpretHypermedia } from "./interpreter";
import { rankActions } from "./ranker";
import { simulateAction } from "./simulator";

const createOperationRequirements: Record<NavigatorCreateOperation, string[]> = {
  "create-supplier": ["supplierName", "currencyCode"],
  "create-requisition": ["requester", "department", "currencyCode"],
  "create-purchase-order": ["supplierId", "totalAmount", "currencyCode", "deliveryAddress"],
  "create-fiscal-year": ["ledgerId", "year", "startDate", "endDate"],
  "create-fiscal-period": ["fiscalYearId", "periodNumber", "startDate", "endDate"],
  "create-payment": ["invoiceId", "amount", "currencyCode", "method"]
};

const nextStepPlaybook: Record<string, Array<{ operation: NavigatorCreateOperation; score: number; rationale: string; prerequisites: string[] }>> = {
  supplier: [
    {
      operation: "create-requisition",
      score: 0.74,
      rationale: "Supplier master data exists; a requisition is typically the next commercial step.",
      prerequisites: ["Budget owner identified", "Requesting department selected"]
    },
    {
      operation: "create-purchase-order",
      score: 0.66,
      rationale: "If demand is already known, proceed to purchase-order creation with the new supplier.",
      prerequisites: ["Supplier ID available", "PO amount and delivery terms prepared"]
    }
  ],
  requisition: [
    {
      operation: "create-purchase-order",
      score: 0.78,
      rationale: "Approved requisitions usually progress to purchase-order issuance.",
      prerequisites: ["Requisition approved", "Supplier selected"]
    }
  ]
};

const authorityTrackingActionId = "authority-required";
const authorityTrackingActorId = "principal.system";

interface AuthorityRequisitionRow {
  requisition_id?: string;
  state?: string;
  status?: string;
}

interface AuthorityCustomerRow {
  customer_id?: string;
  state?: string;
  status?: string;
}

interface AuthorityJournalRow {
  journal_id?: string;
  state?: string;
  status?: string;
}

interface PromptRequisitionLineInput {
  description: string;
  quantity: number;
  unitPrice: number;
}

function normalizeLifecycleToken(value: string | undefined): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
}

function isSubmittedRequisitionForApproval(requisition: AuthorityRequisitionRow): boolean {
  const lifecycle = normalizeLifecycleToken(requisition.state ?? requisition.status);
  return ["submitted", "pendingapproval", "awaitingapproval", "inreview"].includes(lifecycle);
}

function isDraftCustomerForApproval(customer: AuthorityCustomerRow): boolean {
  const lifecycle = normalizeLifecycleToken(customer.status ?? customer.state);
  return lifecycle === "draft";
}

function isPendingJournalForApproval(journal: AuthorityJournalRow): boolean {
  const lifecycle = normalizeLifecycleToken(journal.state ?? journal.status);
  if (!lifecycle) {
    return true;
  }

  if (["posted", "closed", "locked", "cancelled", "canceled", "reversed"].includes(lifecycle)) {
    return false;
  }

  return ["draft", "pending", "pendingapproval", "awaitingapproval", "readytopost", "unposted"].includes(lifecycle);
}

export function extractJsonObject(text: string): Record<string, unknown> | undefined {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) {
    return undefined;
  }

  try {
    return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

export function normalizeCreatePayload(operation: NavigatorCreateOperation, payload: Record<string, unknown>): Record<string, unknown> {
  const normalized = { ...payload };

  if (operation === "create-supplier") {
    if (typeof normalized["country"] === "string" && !normalized["countryCode"]) {
      const country = String(normalized["country"]).trim().toUpperCase();
      if (country === "UAE" || country === "UNITED ARAB EMIRATES") {
        normalized["countryCode"] = "AE";
      }
    }
    if (typeof normalized["countryCode"] === "string") {
      normalized["countryCode"] = String(normalized["countryCode"]).trim().toUpperCase();
    }
  }

  if (typeof normalized["currencyCode"] === "string") {
    normalized["currencyCode"] = String(normalized["currencyCode"]).trim().toUpperCase();
  }

  if (typeof normalized["paymentTerms"] === "string") {
    normalized["paymentTerms"] = String(normalized["paymentTerms"]).trim().toUpperCase();
  }

  return normalized;
}

export function missingRequiredFields(operation: NavigatorCreateOperation, payload: Record<string, unknown>): string[] {
  const required = createOperationRequirements[operation] ?? [];
  return required.filter((field) => {
    const value = payload[field];
    if (value === undefined || value === null) {
      return true;
    }
    if (typeof value === "string" && value.trim().length === 0) {
      return true;
    }
    return false;
  });
}

export function inferOperationFromPrompt(prompt: string): NavigatorCreateOperation | undefined {
  const lower = prompt.toLowerCase();
  if (lower.includes("requisition")) return "create-requisition";
  if (lower.includes("purchase order") || lower.includes("purchase-order") || /\bpo\b/.test(lower)) return "create-purchase-order";
  if (lower.includes("fiscal year")) return "create-fiscal-year";
  if (lower.includes("fiscal period")) return "create-fiscal-period";
  if (lower.includes("payment")) return "create-payment";
  if (lower.includes("supplier")) return "create-supplier";
  return undefined;
}

function resourceFieldAsString(resource: Record<string, unknown> | undefined, keys: string[]): string | undefined {
  if (!resource) {
    return undefined;
  }

  for (const key of keys) {
    const direct = resource[key];
    if (typeof direct === "string" && direct.trim().length > 0) {
      return direct;
    }
  }

  const attributesValue = resource["attributes"];
  if (!attributesValue || typeof attributesValue !== "object" || Array.isArray(attributesValue)) {
    return undefined;
  }

  const attributes = attributesValue as Record<string, unknown>;
  for (const key of keys) {
    const attributeValue = attributes[key];
    if (typeof attributeValue === "string" && attributeValue.trim().length > 0) {
      return attributeValue;
    }
  }

  return undefined;
}

export function extractCurrencyCodeFromPrompt(prompt: string): string | undefined {
  const match = prompt.match(/\b(AED|USD|EUR|GBP|SAR)\b/i);
  return match?.[1]?.toUpperCase();
}

function defaultLegalEntityIdFromCurrency(currencyCode: string | undefined): string {
  const token = String(currencyCode ?? "").trim().toUpperCase();
  if (token === "AED") {
    return "LE-SEED-AE";
  }
  if (token === "AUD") {
    return "LE-SEED-AU";
  }

  return "LE-SEED-US";
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function extractRequisitionLinesFromPrompt(prompt: string): PromptRequisitionLineInput[] {
  const normalized = prompt.replace(/[\r\n]+/g, " ");
  const pattern = /(?:for|need|requires?)\s+(\d+(?:\.\d+)?)\s+([a-z][a-z\s\-]{1,60}?)\s+(?:at|@)\s+(\d+(?:\.\d+)?)/i;
  const match = normalized.match(pattern);
  if (!match) {
    return [];
  }

  const quantity = Number(match[1]);
  const unitPrice = Number(match[3]);
  const description = String(match[2] ?? "").trim();
  if (!description || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitPrice) || unitPrice < 0) {
    return [];
  }

  return [
    {
      description,
      quantity,
      unitPrice
    }
  ];
}

function extractPromptRequisitionLines(payload: Record<string, unknown>): PromptRequisitionLineInput[] {
  const rawLines = payload["lines"];
  if (!Array.isArray(rawLines)) {
    return [];
  }

  const parsed: PromptRequisitionLineInput[] = [];
  for (const candidate of rawLines) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      continue;
    }

    const line = candidate as Record<string, unknown>;
    const description = String(line["description"] ?? "").trim();
    const quantity = Number(line["quantity"]);
    const unitPrice = Number(line["unitPrice"]);
    if (!description || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitPrice) || unitPrice < 0) {
      continue;
    }

    parsed.push({ description, quantity, unitPrice });
  }

  return parsed;
}

function applyPromptContextDefaults(input: PromptCreateRequest, operation: NavigatorCreateOperation, payload: Record<string, unknown>): Record<string, unknown> {
  const enriched = { ...payload };
  const context = input.context;

  if (operation === "create-requisition") {
    if (!enriched["requester"]) {
      enriched["requester"] = input.actorId;
    }

    if (!enriched["department"]) {
      enriched["department"] = "Operations";
    }

    if (!enriched["supplierId"] && context?.aggregateType?.toLowerCase() === "supplier" && context.aggregateId) {
      enriched["supplierId"] = context.aggregateId;
    }

    if (!enriched["currencyCode"]) {
      const currencyFromResource = resourceFieldAsString(context?.resource, [
        "currencyCode",
        "currency",
        "defaultCurrency",
        "preferredCurrency"
      ]);
      if (currencyFromResource) {
        enriched["currencyCode"] = currencyFromResource;
      } else {
        const currencyFromPrompt = extractCurrencyCodeFromPrompt(input.prompt);
        if (currencyFromPrompt) {
          enriched["currencyCode"] = currencyFromPrompt;
        }
      }
    }

    if (!enriched["legalEntityId"]) {
      const legalEntityFromResource = resourceFieldAsString(context?.resource, ["legalEntityId", "legal_entity_id"]);
      if (legalEntityFromResource) {
        enriched["legalEntityId"] = legalEntityFromResource;
      } else {
        enriched["legalEntityId"] = defaultLegalEntityIdFromCurrency(String(enriched["currencyCode"] ?? ""));
      }
    }

    if (!enriched["neededByDate"]) {
      enriched["neededByDate"] = todayIsoDate();
    }

    if (!Array.isArray(enriched["lines"])) {
      const lines = extractRequisitionLinesFromPrompt(input.prompt);
      if (lines.length > 0) {
        enriched["lines"] = lines;
      }
    }
  }

  if (operation === "create-purchase-order") {
    if (!enriched["supplierId"] && context?.aggregateType?.toLowerCase() === "supplier" && context.aggregateId) {
      enriched["supplierId"] = context.aggregateId;
    }
  }

  return enriched;
}

export function heuristicSupplierPayload(prompt: string): Record<string, unknown> {
  const lower = prompt.toLowerCase();
  const nameMatch = prompt.match(/named\s+([a-z0-9\s\-.'&]+)/i);
  const emailMatch = prompt.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  const termsMatch = prompt.match(/net\s?([0-9]{2,3})/i);
  const currencyMatch = prompt.match(/\b(AED|USD|EUR|GBP|SAR)\b/i);

  const payload: Record<string, unknown> = {
    supplierName: nameMatch?.[1]?.trim() || "New Supplier",
    email: emailMatch?.[0] || "supplier@example.local",
    paymentTerms: termsMatch ? `NET${termsMatch[1]}` : "NET30",
    currencyCode: currencyMatch?.[1]?.toUpperCase() || "USD"
  };

  if (lower.includes(" uae") || lower.includes(" in uae") || lower.includes("united arab emirates")) {
    payload["countryCode"] = "AE";
    payload["country"] = "United Arab Emirates";
  }

  return payload;
}

export function clampScore(value: number): number {
  return Math.max(0.05, Math.min(0.99, Number(value.toFixed(3))));
}

export function adjustSuggestionScore(input: {
  suggestion: NextStepSuggestion;
  historySignals: {
    eventCount: number;
    recentEventTypes: string[];
    hasRecentEntityCreated: boolean;
  };
  aggregateType: string;
}): number {
  let score = input.suggestion.score;

  if (input.suggestion.kind === "CREATE_OPERATION") {
    if (input.historySignals.hasRecentEntityCreated) {
      score += 0.06;
    }

    if (
      input.aggregateType === "supplier" &&
      input.suggestion.operation === "create-requisition" &&
      input.historySignals.recentEventTypes.includes("Navigator.EntityCreated")
    ) {
      score += 0.08;
    }

    if (
      input.aggregateType === "requisition" &&
      input.suggestion.operation === "create-purchase-order" &&
      input.historySignals.recentEventTypes.some((eventType) => eventType.includes("Approved"))
    ) {
      score += 0.07;
    }
  }

  if (input.suggestion.kind === "ACTION" && input.historySignals.eventCount > 20) {
    score += 0.02;
  }

  return clampScore(score);
}

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
      userNote: ctx.userNote,
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
    let actionOptions: ActionOption[];

    if (actionId) {
      const ranked = await this.rank(ctx);
      actionOptions = ranked.context.actionOptions;
      const picked = ranked.rankedActions.find((item) => item.actionId === actionId);
      decision = {
        action: picked ?? { actionId, score: 0.5, rationale: "Action selected by operator." },
        mode: "EXECUTE",
        explanation: "Action forced by operator command."
      };
    } else {
      const ranked = await this.rank(ctx);
      actionOptions = ranked.context.actionOptions;
      decision = await decide({
        context: ranked.context,
        rankedActions: ranked.rankedActions,
        authorityClient: this.authorityClient,
        governanceClient: this.governanceClient
      });
    }

    return executeDecision({
      context: ctx,
      decision,
      actionOptions,
      integrationHubClient: this.integrationHubClient,
      cepClient: this.cepClient,
      llmClient: this.llmClient
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

  async approvals(input: {
    domain: SessionContext["domain"];
    aggregateType: string;
    aggregateId: string;
    status?: ApprovalRequestStatus;
    limit?: number;
  }) {
    await this.syncAuthorityDrivenApprovals(input);
    return listApprovalRequests(input);
  }

  private async syncAuthorityDrivenApprovals(input: {
    domain: SessionContext["domain"];
    aggregateType: string;
    aggregateId: string;
  }) {
    const authorityDecision = await this.isAuthorityApprovalRequired(input);
    if (authorityDecision === undefined) {
      return;
    }

    const tracked = listApprovalRequests({
      domain: input.domain,
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      limit: 1000
    });

    const trackedAuthorityPending = tracked.find((item) =>
      item.actionId === authorityTrackingActionId &&
      item.status === "PENDING" &&
      item.context["source"] === "authority-dashboard"
    );

    if (authorityDecision.required && !trackedAuthorityPending) {
      recordApprovalRequest({
        domain: input.domain,
        aggregateType: input.aggregateType,
        aggregateId: input.aggregateId,
        actorId: authorityTrackingActorId,
        actionId: authorityTrackingActionId,
        requiredTier: authorityDecision.requiredTier,
        reasons: [authorityDecision.reason],
        context: {
          source: "authority-dashboard",
          basis: authorityDecision.basis,
          aggregateType: input.aggregateType,
          aggregateId: input.aggregateId
        },
        responseBody: {
          detail: authorityDecision.reason,
          source: "authority-engine",
          tracking: "navigator"
        }
      });
      return;
    }

    if (!authorityDecision.required) {
      for (const item of tracked) {
        if (
          item.actionId === authorityTrackingActionId &&
          item.status === "PENDING" &&
          item.context["source"] === "authority-dashboard"
        ) {
          updateApprovalRequest({
            approvalRequestId: item.approvalRequestId,
            status: "EXPIRED",
            resolvedBy: authorityTrackingActorId,
            note: "Authority source no longer flags this item for approval.",
            requiredTier: item.requiredTier
          });
        }
      }
    }
  }

  private async isAuthorityApprovalRequired(input: {
    domain: SessionContext["domain"];
    aggregateType: string;
    aggregateId: string;
  }): Promise<{ required: boolean; requiredTier: number; reason: string; basis: string } | undefined> {
    try {
      const aggregateTypeToken = input.aggregateType.trim().toLowerCase();

      if (input.domain === "O2C" && ["o2c_customer", "customer"].includes(aggregateTypeToken)) {
        const row = await this.integrationHubClient.queryRow<AuthorityCustomerRow>({
          table: "o2c_customer",
          id: input.aggregateId,
          actorId: authorityTrackingActorId
        });
        const required = row ? isDraftCustomerForApproval(row) : false;
        return {
          required,
          requiredTier: 2,
          reason: "Authority/constitution requires approval for draft customer activation.",
          basis: "o2c_customer:draft"
        };
      }

      if (input.domain === "P2P" && ["p2p_requisition", "requisition"].includes(aggregateTypeToken)) {
        const row = await this.integrationHubClient.queryRow<AuthorityRequisitionRow>({
          table: "p2p_requisition",
          id: input.aggregateId,
          actorId: authorityTrackingActorId
        });
        const required = row ? isSubmittedRequisitionForApproval(row) : false;
        return {
          required,
          requiredTier: 2,
          reason: "Authority/constitution requires approval for submitted requisitions.",
          basis: "p2p_requisition:submitted"
        };
      }

      if (input.domain === "R2R" && ["r2r_journal", "journal"].includes(aggregateTypeToken)) {
        const row = await this.integrationHubClient.queryRow<AuthorityJournalRow>({
          table: "r2r_journal",
          id: input.aggregateId,
          actorId: authorityTrackingActorId
        });
        const required = row ? isPendingJournalForApproval(row) : false;
        return {
          required,
          requiredTier: 3,
          reason: "Authority/constitution requires approval for pending journals.",
          basis: "r2r_journal:pending"
        };
      }

      return undefined;
    } catch {
      return undefined;
    }
  }

  async approval(approvalRequestId: string) {
    return getApprovalRequest(approvalRequestId);
  }

  private async transitionApproval(input: {
    approvalRequestId: string;
    resolution: ApprovalResolutionInput;
    status: ApprovalRequestStatus;
    eventType: string;
  }) {
    const existing = getApprovalRequest(input.approvalRequestId);
    if (!existing) {
      throw new HttpError(404, "approval_not_found", `Approval request '${input.approvalRequestId}' was not found`);
    }

    if (existing.status !== "PENDING" && !(existing.status === "ESCALATED" && input.status !== "ESCALATED")) {
      throw new HttpError(409, "approval_not_pending", `Approval request '${input.approvalRequestId}' is already ${existing.status}`);
    }

    const updated = updateApprovalRequest({
      approvalRequestId: input.approvalRequestId,
      status: input.status,
      resolvedBy: input.resolution.actorId,
      note: input.resolution.note,
      requiredTier: input.status === "ESCALATED"
        ? Math.max(input.resolution.requiredTier ?? (existing.requiredTier ?? 1) + 1, (existing.requiredTier ?? 1) + 1)
        : existing.requiredTier
    });

    if (!updated) {
      throw new HttpError(404, "approval_not_found", `Approval request '${input.approvalRequestId}' was not found`);
    }

    recordNavigatorEvent({
      eventType: input.eventType,
      domain: updated.domain,
      aggregateType: updated.aggregateType,
      aggregateId: updated.aggregateId,
      actorId: input.resolution.actorId,
      payload: {
        approvalRequestId: updated.approvalRequestId,
        actionId: updated.actionId,
        status: updated.status,
        requiredTier: updated.requiredTier,
        note: input.resolution.note ?? null
      }
    });

    await this.cepClient.publish({
      eventType: input.eventType,
      actorId: input.resolution.actorId,
      domain: updated.domain as SessionContext["domain"],
      aggregateType: updated.aggregateType,
      aggregateId: updated.aggregateId,
      payload: {
        approvalRequestId: updated.approvalRequestId,
        actionId: updated.actionId,
        status: updated.status,
        requiredTier: updated.requiredTier,
        note: input.resolution.note ?? null
      }
    });

    return updated;
  }

  async approveApprovalRequest(approvalRequestId: string, resolution: ApprovalResolutionInput) {
    // Transition the approval to APPROVED
    const updated = await this.transitionApproval({
      approvalRequestId,
      resolution,
      status: "APPROVED",
      eventType: "Navigator.ApprovalApproved"
    });

    // Attempt post-approval automatic execution
    try {
      await this.executeApprovedAction(updated, resolution);
    } catch (err) {
      // Log execution error but don't fail the approval resolution
      console.error(`Post-approval execution failed for approval ${approvalRequestId}:`, err);
      recordNavigatorEvent({
        eventType: "Navigator.PostApprovalExecutionFailed",
        domain: updated.domain,
        aggregateType: updated.aggregateType,
        aggregateId: updated.aggregateId,
        actorId: resolution.actorId,
        payload: {
          approvalRequestId: updated.approvalRequestId,
          actionId: updated.actionId,
          error: err instanceof Error ? err.message : "Unknown error"
        }
      });

      await this.cepClient.publish({
        eventType: "Navigator.PostApprovalExecutionFailed",
        actorId: resolution.actorId,
        domain: updated.domain as SessionContext["domain"],
        aggregateType: updated.aggregateType,
        aggregateId: updated.aggregateId,
        payload: {
          approvalRequestId: updated.approvalRequestId,
          actionId: updated.actionId,
          error: err instanceof Error ? err.message : "Unknown error"
        }
      });
    }

    return updated;
  }

  private async executeApprovedAction(approval: ApprovalRequestRecord | undefined, resolution: ApprovalResolutionInput) {
    if (!approval) {
      throw new Error("Approval request not found");
    }

    // Extract action from approval context
    const actionContext = approval.context as Record<string, unknown>;
    const action = actionContext["action"] as Record<string, unknown> | null;

    if (!action) {
      throw new Error("Action context not found in approval request");
    }

    // Reconstruct SessionContext for re-execution
    const ctx: SessionContext = {
      domain: approval.domain as SessionContext["domain"],
      aggregateType: approval.aggregateType,
      aggregateId: approval.aggregateId,
      actorId: resolution.actorId,
      userNote: typeof actionContext["userNote"] === "string" ? actionContext["userNote"] : undefined
    };

    // Build execution context
    const executionContext = await this.buildContext(ctx);

    // Execute the approved action
    const result = await executeDecision({
      context: ctx,
      decision: {
        action: {
          actionId: approval.actionId,
          score: 1.0,
          rationale: "Auto-execution after approval"
        },
        mode: "EXECUTE",
        explanation: "Approved by governance. Executing automatically."
      },
      actionOptions: executionContext.actionOptions,
      integrationHubClient: this.integrationHubClient,
      cepClient: this.cepClient,
      llmClient: this.llmClient
    });

    // Emit post-approval execution success event
    recordNavigatorEvent({
      eventType: "Navigator.PostApprovalExecuted",
      domain: approval.domain,
      aggregateType: approval.aggregateType,
      aggregateId: approval.aggregateId,
      actorId: resolution.actorId,
      payload: {
        approvalRequestId: approval.approvalRequestId,
        actionId: approval.actionId,
        executionResult: {
          mode: result.mode,
          statusCode: result.statusCode
        }
      }
    });

    await this.cepClient.publish({
      eventType: "Navigator.PostApprovalExecuted",
      actorId: resolution.actorId,
      domain: approval.domain as SessionContext["domain"],
      aggregateType: approval.aggregateType,
      aggregateId: approval.aggregateId,
      payload: {
        approvalRequestId: approval.approvalRequestId,
        actionId: approval.actionId,
        executionResult: {
          mode: result.mode,
          statusCode: result.statusCode
        }
      }
    });
  }

  async rejectApprovalRequest(approvalRequestId: string, resolution: ApprovalResolutionInput) {
    return this.transitionApproval({
      approvalRequestId,
      resolution,
      status: "REJECTED",
      eventType: "Navigator.ApprovalRejected"
    });
  }

  async escalateApprovalRequest(approvalRequestId: string, resolution: ApprovalResolutionInput) {
    return this.transitionApproval({
      approvalRequestId,
      resolution,
      status: "ESCALATED",
      eventType: "Navigator.ApprovalEscalated"
    });
  }

  async actions(ctx: SessionContext): Promise<ActionOption[]> {
    const resource = await this.integrationHubClient.getResource(ctx);
    return interpretHypermedia(resource, ctx);
  }

  async createEntity(input: {
    operation: NavigatorCreateOperation;
    payload: Record<string, unknown>;
    actorId: string;
  }): Promise<CreateEntityResult> {
    let requisitionLines: PromptRequisitionLineInput[] = [];
    const payloadForCreate = { ...input.payload };
    if (input.operation === "create-requisition") {
      requisitionLines = extractPromptRequisitionLines(payloadForCreate);
      delete payloadForCreate["lines"];
    }

    const result = await this.integrationHubClient.createEntity({
      operation: input.operation,
      actorId: input.actorId,
      payload: payloadForCreate
    });

    if (input.operation === "create-requisition" && result.entityId && requisitionLines.length > 0) {
      const lineResults: Record<string, unknown>[] = [];
      for (const line of requisitionLines) {
        const createdLine = await this.integrationHubClient.addRequisitionLine({
          requisitionId: result.entityId,
          actorId: input.actorId,
          description: line.description,
          quantity: line.quantity,
          unitPrice: line.unitPrice
        });
        lineResults.push(createdLine);
      }

      if (result.data && typeof result.data === "object" && !Array.isArray(result.data)) {
        result.data = {
          ...(result.data as Record<string, unknown>),
          createdLines: lineResults
        };
      }
    }

    if (result.entityId) {
      const domainByType: Record<string, SessionContext["domain"]> = {
        p2p_supplier: "P2P",
        p2p_requisition: "P2P",
        p2p_purchase_order: "P2P",
        r2r_fiscal_year: "R2R",
        r2r_fiscal_period: "R2R",
        o2c_payment: "O2C"
      };
      const aggregateTypeByEntity: Record<string, string> = {
        p2p_supplier: "supplier",
        p2p_requisition: "requisition",
        p2p_purchase_order: "purchase-order",
        r2r_fiscal_year: "fiscal-year",
        r2r_fiscal_period: "fiscal-period",
        o2c_payment: "ar-payment"
      };
      const entityType = String(result.entityType ?? "");
      const domain = domainByType[entityType];
      const aggregateType = aggregateTypeByEntity[entityType];
      if (domain && aggregateType) {
        await this.cepClient.publish({
          eventType: "Navigator.EntityCreated",
          actorId: input.actorId,
          domain,
          aggregateType,
          aggregateId: result.entityId,
          payload: {
            operation: input.operation,
            entityType,
            entityId: result.entityId
          }
        });
      }
    }

    return result;
  }

  async promptCreate(input: PromptCreateRequest): Promise<PromptCreateResult> {
    const operation = inferOperationFromPrompt(input.prompt);
    if (!operation) {
      return {
        status: "NEEDS_CLARIFICATION",
        resolution: {
          operation: "create-supplier",
          payload: {},
          missingFields: ["operation"],
          clarification: "Specify what to create (supplier, requisition, purchase order, fiscal year, fiscal period, or payment)."
        }
      };
    }

    let resolution: PromptCreateResolution | undefined;

    try {
      const extractionPrompt = [
        `Operator prompt: ${input.prompt}`,
        `Resolved operation: ${operation}`,
        `Return strict JSON object: { "payload": { ... } } using realistic values from the prompt.`,
        `Do not invent required IDs that are not provided (for example supplierId, invoiceId).`
      ].join("\n");

      const llmResponse = await this.llmClient.chat([
        {
          role: "system",
          content: "You are a structured creation intent parser. Respond with JSON only."
        },
        {
          role: "user",
          content: extractionPrompt
        }
      ]);

      const parsed = extractJsonObject(llmResponse);
      const payload = parsed && typeof parsed["payload"] === "object" && parsed["payload"] !== null
        ? (parsed["payload"] as Record<string, unknown>)
        : {};

      resolution = {
        operation,
        payload,
        missingFields: []
      };
    } catch {
      // Fall through to deterministic heuristics.
    }

    if (!resolution) {
      resolution = {
        operation,
        payload: operation === "create-supplier" ? heuristicSupplierPayload(input.prompt) : {},
        missingFields: []
      };
    }

    resolution.payload = applyPromptContextDefaults(input, resolution.operation, resolution.payload);
    resolution.payload = normalizeCreatePayload(resolution.operation, resolution.payload);
    resolution.missingFields = missingRequiredFields(resolution.operation, resolution.payload);

    if (resolution.missingFields.length > 0) {
      resolution.clarification = `Missing fields for ${resolution.operation}: ${resolution.missingFields.join(", ")}.`;
      return {
        status: "NEEDS_CLARIFICATION",
        resolution
      };
    }

    if (input.dryRun === true) {
      return {
        status: "READY",
        resolution
      };
    }

    const created = await this.createEntity({
      operation: resolution.operation,
      payload: resolution.payload,
      actorId: input.actorId
    });

    recordNavigatorEvent({
      eventType: "Navigator.PromptCreateExecuted",
      domain: input.domain ?? "P2P",
      aggregateType: created.entityType ?? resolution.operation,
      aggregateId: created.entityId ?? "pending",
      actorId: input.actorId,
      payload: {
        prompt: input.prompt,
        operation: resolution.operation,
        payload: resolution.payload,
        entityId: created.entityId
      }
    });

    await this.cepClient.publish({
      eventType: "Navigator.PromptCreateExecuted",
      actorId: input.actorId,
      domain: input.domain ?? "P2P",
      aggregateType: created.entityType ?? resolution.operation,
      aggregateId: created.entityId ?? "pending",
      payload: {
        prompt: input.prompt,
        operation: resolution.operation,
        payload: resolution.payload,
        entityId: created.entityId
      }
    });

    return {
      status: "READY",
      resolution,
      created
    };
  }

  async nextSteps(ctx: SessionContext, limit = 5): Promise<NextStepResult> {
    const safeLimit = Math.max(1, Math.min(limit, 20));
    const ranked = await this.rank(ctx);

    const recentEventTypes = ranked.context.recentHistory
      .map((event) => {
        const value = event["eventType"];
        return typeof value === "string" ? value : undefined;
      })
      .filter((value): value is string => Boolean(value));

    const historySignals = {
      eventCount: ranked.context.recentHistory.length,
      recentEventTypes: [...new Set(recentEventTypes)].slice(0, 8),
      hasRecentEntityCreated: recentEventTypes.includes("Navigator.EntityCreated")
    };

    const actionSuggestions: NextStepSuggestion[] = ranked.rankedActions.map((item) => ({
      stepId: `action:${item.actionId}`,
      kind: "ACTION",
      actionId: item.actionId,
      score: item.score,
      rationale: item.rationale,
      prerequisites: []
    }));

    const createSuggestions = (nextStepPlaybook[ctx.aggregateType] ?? []).map((item) => ({
      stepId: `create:${item.operation}`,
      kind: "CREATE_OPERATION" as const,
      operation: item.operation,
      score: item.score,
      rationale: item.rationale,
      prerequisites: item.prerequisites
    }));

    const scoredSuggestions = [...actionSuggestions, ...createSuggestions].map((suggestion) => ({
      ...suggestion,
      score: adjustSuggestionScore({
        suggestion,
        historySignals,
        aggregateType: ctx.aggregateType
      })
    }));

    const suggestions = scoredSuggestions
      .sort((a, b) => b.score - a.score)
      .slice(0, safeLimit);

    recordNavigatorEvent({
      eventType: "Navigator.NextStepsRecommended",
      domain: ctx.domain,
      aggregateType: ctx.aggregateType,
      aggregateId: ctx.aggregateId,
      actorId: ctx.actorId,
      payload: {
        suggestions,
        historySignals
      }
    });

    await this.cepClient.publish({
      eventType: "Navigator.NextStepsRecommended",
      actorId: ctx.actorId,
      domain: ctx.domain,
      aggregateType: ctx.aggregateType,
      aggregateId: ctx.aggregateId,
      payload: {
        suggestions,
        historySignals
      }
    });

    return {
      suggestions,
      historySignals
    };
  }

  async createLookups(kind: NavigatorLookupKind, actorId: string): Promise<Array<Record<string, unknown>>> {
    return this.integrationHubClient.getCreateLookups({ kind, actorId });
  }
}
