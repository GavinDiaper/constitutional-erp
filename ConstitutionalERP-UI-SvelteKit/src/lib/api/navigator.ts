import type { ActorContext } from '$lib/stores/actorStore';

export interface NavigatorContext {
	domain: string;
	aggregateType: string;
	aggregateId: string;
	actorId: string;
	userNote?: string;
}

export interface RankedAction {
	actionId: string;
	label?: string;
	score?: number;
	rationale?: string;
}

export interface ActionOption {
	id: string;
	href: string;
	method: 'POST' | 'GET';
	domain: string;
	aggregateType: string;
	aggregateId: string;
	currentState: string;
	requiresApproval: boolean;
	requiredTier?: number;
	riskSignals?: Record<string, unknown>;
}

export interface CanonicalResource {
	id: string;
	domain: string;
	type: string;
	state: string;
	attributes: Record<string, unknown>;
	links: Record<
		string,
		{
			href: string;
			method: 'POST' | 'GET';
			requiresApproval?: boolean;
			requiredTier?: number;
			riskLevel?: string;
		}
	>;
}

export interface RankResponse {
	rankedActions: RankedAction[];
	actionOptions?: ActionOption[];
}

export interface ExplainResponse {
	explanation: string;
}

export interface SimulationResult {
	predictedState: string;
	predictedTransitions: string[];
	riskSummary: string;
	financialImpact?: number;
	narrative: string;
}

export type DecisionMode = 'EXECUTE' | 'REQUEST_APPROVAL' | 'REJECT' | 'NO_ACTION';

export interface DecisionOutcome {
	action: RankedAction | null;
	mode: DecisionMode;
	explanation: string;
}

export interface ExecutionResult {
	mode: DecisionMode;
	actionId: string;
	statusCode: number;
	responseBody: Record<string, unknown>;
}

export type ApprovalRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'ESCALATED' | 'EXPIRED';

export interface ApprovalRequestRecord {
	approvalRequestId: string;
	domain: string;
	aggregateType: string;
	aggregateId: string;
	actorId: string;
	actionId: string;
	status: ApprovalRequestStatus;
	requiredTier?: number;
	reasons: string[];
	context: Record<string, unknown>;
	responseBody: Record<string, unknown>;
	createdAt: string;
	updatedAt: string;
	resolvedAt?: string;
	resolvedBy?: string;
}

export type NavigatorCreateOperation =
	| 'create-supplier'
	| 'create-requisition'
	| 'create-purchase-order'
	| 'create-fiscal-year'
	| 'create-fiscal-period'
	| 'create-payment';

export type NavigatorCreateLookupKind = 'suppliers' | 'ledgers' | 'fiscal-years' | 'invoices';

export interface NavigatorCreateResult {
	operation: NavigatorCreateOperation;
	entityType?: string;
	entityId?: string;
	data: unknown;
}

export interface PromptCreateResolution {
	operation: NavigatorCreateOperation;
	payload: Record<string, unknown>;
	missingFields: string[];
	clarification?: string;
}

export interface PromptCreateResult {
	status: 'READY' | 'NEEDS_CLARIFICATION';
	resolution: PromptCreateResolution;
	created?: NavigatorCreateResult;
}

export interface NextStepSuggestion {
	stepId: string;
	kind: 'ACTION' | 'CREATE_OPERATION';
	score: number;
	rationale: string;
	actionId?: string;
	operation?: NavigatorCreateOperation;
	prerequisites: string[];
}

export interface NextStepResult {
	suggestions: NextStepSuggestion[];
	historySignals: {
		eventCount: number;
		recentEventTypes: string[];
		hasRecentEntityCreated: boolean;
	};
}

function actorHeaders(actor: ActorContext): HeadersInit {
	return {
		'content-type': 'application/json',
		'x-actor-id': actor.actorId,
		'x-actor-tier': String(actor.authorityTier)
	};
}

async function readErrorMessage(response: Response, fallback: string): Promise<string> {
	const text = await response.text();

	if (!text) {
		return fallback;
	}

	// Detect HTML responses (likely error page or server down)
	if (text.trim().toLowerCase().startsWith('<!doctype html') || text.includes('<html')) {
		const statusText = response.statusText || 'Unknown Error';
		return `${fallback} (HTTP ${response.status} ${statusText}). Received HTML response instead of JSON. Navigator API may not be running or is misconfigured. Check that NAVIGATOR_AI_URL is set correctly and the service is listening on port 4016.`;
	}

	try {
		const parsed = JSON.parse(text) as {
			detail?: unknown;
			message?: unknown;
			title?: unknown;
		};

		if (typeof parsed.detail === 'string' && parsed.detail.trim().length > 0) {
			return parsed.detail;
		}

		if (typeof parsed.message === 'string' && parsed.message.trim().length > 0) {
			return parsed.message;
		}

		if (typeof parsed.title === 'string' && parsed.title.trim().length > 0) {
			return parsed.title;
		}
	} catch {
		// Fall through to raw text.
	}

	return text;
}

export async function rankActions(
	context: NavigatorContext,
	actor: ActorContext
): Promise<RankResponse> {
	const response = await fetch('/api/navigator/rank', {
		method: 'POST',
		headers: actorHeaders(actor),
		body: JSON.stringify(context)
	});

	if (!response.ok) {
		throw new Error(await readErrorMessage(response, 'Navigator rank request failed'));
	}

	return (await response.json()) as RankResponse;
}

export async function explainAction(
	context: NavigatorContext,
	actionId: string | undefined,
	actor: ActorContext
): Promise<ExplainResponse> {
	const response = await fetch('/api/navigator/explain', {
		method: 'POST',
		headers: actorHeaders(actor),
		body: JSON.stringify({ context, actionId })
	});

	if (!response.ok) {
		throw new Error(await readErrorMessage(response, 'Navigator explain request failed'));
	}

	return (await response.json()) as ExplainResponse;
}

export async function getResource(
	context: NavigatorContext,
	actor: ActorContext
): Promise<CanonicalResource> {
	const query = new URLSearchParams({
		domain: context.domain,
		aggregateType: context.aggregateType,
		aggregateId: context.aggregateId,
		actorId: context.actorId
	});

	const response = await fetch(`/api/navigator/resource?${query.toString()}`, {
		method: 'GET',
		headers: actorHeaders(actor)
	});

	if (!response.ok) {
		throw new Error(await readErrorMessage(response, 'Navigator resource request failed'));
	}

	return (await response.json()) as CanonicalResource;
}

export async function getActions(
	context: NavigatorContext,
	actor: ActorContext
): Promise<ActionOption[]> {
	const query = new URLSearchParams({
		domain: context.domain,
		aggregateType: context.aggregateType,
		aggregateId: context.aggregateId,
		actorId: context.actorId
	});

	const response = await fetch(`/api/navigator/actions?${query.toString()}`, {
		method: 'GET',
		headers: actorHeaders(actor)
	});

	if (!response.ok) {
		throw new Error(await readErrorMessage(response, 'Navigator actions request failed'));
	}

	const data = (await response.json()) as { data?: ActionOption[] };
	return data.data ?? [];
}

export async function simulateAction(
	context: NavigatorContext,
	actionId: string,
	actor: ActorContext
): Promise<SimulationResult> {
	const response = await fetch('/api/navigator/simulate', {
		method: 'POST',
		headers: actorHeaders(actor),
		body: JSON.stringify({ context, actionId })
	});

	if (!response.ok) {
		throw new Error(await readErrorMessage(response, 'Navigator simulate request failed'));
	}

	return (await response.json()) as SimulationResult;
}

export async function decide(
	context: NavigatorContext,
	actor: ActorContext
): Promise<DecisionOutcome> {
	const response = await fetch('/api/navigator/decide', {
		method: 'POST',
		headers: actorHeaders(actor),
		body: JSON.stringify(context)
	});

	if (!response.ok) {
		throw new Error(await readErrorMessage(response, 'Navigator decide request failed'));
	}

	return (await response.json()) as DecisionOutcome;
}

export async function executeAction(
	context: NavigatorContext,
	actionId: string | undefined,
	actor: ActorContext
): Promise<ExecutionResult> {
	const response = await fetch('/api/navigator/execute', {
		method: 'POST',
		headers: actorHeaders(actor),
		body: JSON.stringify({ context, actionId })
	});

	if (!response.ok) {
		throw new Error(await readErrorMessage(response, 'Navigator execute request failed'));
	}

	return (await response.json()) as ExecutionResult;
}

export async function createEntity(
	operation: NavigatorCreateOperation,
	payload: Record<string, unknown>,
	actor: ActorContext
): Promise<NavigatorCreateResult> {
	const response = await fetch('/api/navigator/create', {
		method: 'POST',
		headers: actorHeaders(actor),
		body: JSON.stringify({
			operation,
			payload,
			actorId: actor.actorId
		})
	});

	if (!response.ok) {
		throw new Error(await readErrorMessage(response, 'Navigator create request failed'));
	}

	return (await response.json()) as NavigatorCreateResult;
}

export async function getCreateLookups(
	kind: NavigatorCreateLookupKind,
	actor: ActorContext
): Promise<Array<Record<string, unknown>>> {
	const query = new URLSearchParams({ actorId: actor.actorId });
	const response = await fetch(`/api/navigator/create/lookups/${encodeURIComponent(kind)}?${query.toString()}`, {
		method: 'GET',
		headers: actorHeaders(actor)
	});

	if (!response.ok) {
		throw new Error(await readErrorMessage(response, 'Navigator lookup request failed'));
	}

	const data = (await response.json()) as { data?: Array<Record<string, unknown>> };
	return data.data ?? [];
}

export async function promptCreateEntity(
	input: {
		prompt: string;
		actorId: string;
		domain?: string;
		context?: {
			domain?: string;
			aggregateType?: string;
			aggregateId?: string;
			resource?: Record<string, unknown>;
		};
		dryRun?: boolean;
	},
	actor: ActorContext
): Promise<PromptCreateResult> {
	const response = await fetch('/api/navigator/create/prompt', {
		method: 'POST',
		headers: actorHeaders(actor),
		body: JSON.stringify(input)
	});

	if (!response.ok) {
		throw new Error(await readErrorMessage(response, 'Navigator prompt create request failed'));
	}

	return (await response.json()) as PromptCreateResult;
}

export async function getNextSteps(
	context: NavigatorContext,
	actor: ActorContext,
	limit = 5
): Promise<NextStepResult> {
	const response = await fetch('/api/navigator/next-steps', {
		method: 'POST',
		headers: actorHeaders(actor),
		body: JSON.stringify({
			context,
			limit
		})
	});

	if (!response.ok) {
		throw new Error(await readErrorMessage(response, 'Navigator next steps request failed'));
	}

	return (await response.json()) as NextStepResult;
}

export async function getApprovalRequests(
	context: NavigatorContext,
	actor: ActorContext,
	limit = 50,
	status?: ApprovalRequestStatus
): Promise<ApprovalRequestRecord[]> {
	const query = new URLSearchParams({
		domain: context.domain,
		aggregateType: context.aggregateType,
		aggregateId: context.aggregateId,
		limit: String(limit)
	});

	if (status) {
		query.set('status', status);
	}

	const response = await fetch(`/api/navigator/approvals?${query.toString()}`, {
		method: 'GET',
		headers: actorHeaders(actor)
	});

	if (!response.ok) {
		throw new Error(await readErrorMessage(response, 'Navigator approval list request failed'));
	}

	const data = (await response.json()) as { data?: ApprovalRequestRecord[] };
	return data.data ?? [];
}

export async function getApprovalRequest(
	approvalRequestId: string,
	actor: ActorContext
): Promise<ApprovalRequestRecord> {
	const response = await fetch(`/api/navigator/approvals/${encodeURIComponent(approvalRequestId)}`, {
		method: 'GET',
		headers: actorHeaders(actor)
	});

	if (!response.ok) {
		throw new Error(await readErrorMessage(response, 'Navigator approval detail request failed'));
	}

	return (await response.json()) as ApprovalRequestRecord;
}

export async function resolveApprovalRequest(
	input: {
		approvalRequestId: string;
		action: 'approve' | 'reject' | 'escalate';
		actorId: string;
		note?: string;
		requiredTier?: number;
	},
	actor: ActorContext
): Promise<ApprovalRequestRecord> {
	const response = await fetch(
		`/api/navigator/approvals/${encodeURIComponent(input.approvalRequestId)}/${input.action}`,
		{
			method: 'POST',
			headers: actorHeaders(actor),
			body: JSON.stringify({
				actorId: input.actorId,
				note: input.note,
				requiredTier: input.requiredTier
			})
		}
	);

	if (!response.ok) {
		throw new Error(await readErrorMessage(response, 'Navigator approval resolution request failed'));
	}

	return (await response.json()) as ApprovalRequestRecord;
}
