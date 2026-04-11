import { fetchHubJson } from '$lib/api/hub';
import type { ActorContext } from '$lib/stores/actorStore';
import type { HubActionLink, ProcessResponse } from '$lib/types/hub';

interface RawHypermediaEntity {
	_links?: Record<string, unknown>;
	state?: string;
	status?: string;
	[key: string]: unknown;
}

export async function getProcess(entityType: string, entityId: string, actor: ActorContext): Promise<ProcessResponse> {
	const payload = await fetchHubJson<ProcessResponse | RawHypermediaEntity>(
		`/api/hub/process/${entityType}/${entityId}`,
		actor
	);

	return normalizeProcessPayload(payload, entityType, entityId);
}

export async function executeProcessAction(link: HubActionLink, actor: ActorContext, payload?: Record<string, unknown>): Promise<unknown> {
	const response = await fetch('/api/hub/process/action', {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			'x-actor-id': actor.actorId,
			'x-actor-tier': String(actor.authorityTier)
		},
		body: JSON.stringify({
			href: link.href,
			method: link.method ?? 'POST',
			...(payload && Object.keys(payload).length > 0 ? { body: payload } : {})
		})
	});

	if (!response.ok) {
		const contentType = response.headers.get('content-type') ?? '';
		if (contentType.includes('application/json')) {
			const problem = await response.json();
			throw new Error(formatProblemMessage(problem, 'Failed to execute action'));
		}

		const rawError = await response.text();
		throw new Error(sanitizeActionError(rawError));
	}

	const resultContentType = response.headers.get('content-type') ?? '';
	if (resultContentType.includes('application/json')) {
		return response.json();
	}

	return response.text();
}

function formatProblemMessage(problem: unknown, fallback: string): string {
	if (!problem || typeof problem !== 'object') {
		return fallback;
	}

	const record = problem as Record<string, unknown>;
	const detail = formatProblemField(record.detail);
	if (detail) {
		return detail;
	}

	const title = formatProblemField(record.title);
	return title || fallback;
}

function formatProblemField(value: unknown): string {
	if (typeof value === 'string') {
		return value;
	}

	if (value === undefined || value === null) {
		return '';
	}

	try {
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
}

function sanitizeActionError(rawError: string): string {
	const trimmed = rawError.trim();
	if (!trimmed) {
		return 'Failed to execute action';
	}

	if (/<html[\s>]/i.test(trimmed)) {
		const titleMatch = trimmed.match(/<title>([^<]+)<\/title>/i);
		const title = titleMatch?.[1]?.trim();
		return title
			? `Failed to execute action: upstream returned HTML (${title}).`
			: 'Failed to execute action: upstream returned HTML.';
	}

	const singleLine = trimmed.replace(/\s+/g, ' ');
	return singleLine.length > 240 ? `${singleLine.slice(0, 237)}...` : singleLine;
}

function normalizeProcessPayload(
	payload: ProcessResponse | RawHypermediaEntity,
	entityType: string,
	entityId: string
): ProcessResponse {
	if (typeof payload === 'object' && payload && 'attributes' in payload && '_links' in payload) {
		return payload as ProcessResponse;
	}

	// Handle Integration Hub format: { state, attributes, links: ProcessLink[] }
	if (typeof payload === 'object' && payload && 'attributes' in payload && 'links' in payload) {
		const ihPayload = payload as {
			state?: string;
			attributes: Record<string, unknown>;
			links: Array<{ rel: string; href: string; method?: string; mcpFunctionId?: string; governance?: unknown; requiredInput?: { required?: string[]; properties?: Record<string, { type?: string; description?: string; enum?: string[] }> } }>;
		};
		const _links: Record<string, HubActionLink> = {};
		for (const link of (ihPayload.links ?? [])) {
			if (link.rel && link.rel !== 'self') {
				_links[link.rel] = { href: link.href, method: link.method, inputSchema: link.requiredInput };
			}
		}
		return {
			entityType,
			entityId,
			state: (ihPayload.state ?? 'Unknown') as string,
			attributes: ihPayload.attributes ?? {},
			_links
		};
	}

	const entity = (payload ?? {}) as RawHypermediaEntity;
	const state = (entity.state ?? entity.status ?? 'Unknown') as string;

	const attributes: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(entity)) {
		if (!['_links', 'state', 'status'].includes(key)) {
			attributes[key] = value;
		}
	}

	return {
		entityType,
		entityId,
		state,
		attributes,
		_links: (entity._links as Record<string, { href: string; method?: string }>) ?? {}
	};
}
