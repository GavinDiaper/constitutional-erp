import type { ActorContext } from '$lib/stores/actorStore';

export interface NavigatorContext {
	domain: string;
	aggregateType: string;
	aggregateId: string;
	actorId: string;
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
