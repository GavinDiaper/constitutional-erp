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

export interface RankResponse {
	rankedActions: RankedAction[];
	actionOptions?: unknown[];
}

export interface ExplainResponse {
	explanation: string;
}

function actorHeaders(actor: ActorContext): HeadersInit {
	return {
		'content-type': 'application/json',
		'x-actor-id': actor.actorId,
		'x-actor-tier': String(actor.authorityTier)
	};
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
		const text = await response.text();
		throw new Error(text || 'Navigator rank request failed');
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
		const text = await response.text();
		throw new Error(text || 'Navigator explain request failed');
	}

	return (await response.json()) as ExplainResponse;
}
