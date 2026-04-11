import type { ActorContext } from '$lib/stores/actorStore';

export async function fetchHubJson<T>(path: string, actor: ActorContext): Promise<T> {
	const response = await fetch(path, {
		headers: {
			'x-actor-id': actor.actorId,
			'x-actor-tier': String(actor.authorityTier)
		}
	});

	if (!response.ok) {
		const contentType = response.headers.get('content-type') ?? '';
		if (contentType.includes('application/json')) {
			const problem = await response.json();
			throw new Error(formatProblemMessage(problem, 'Integration Hub request failed'));
		}

		throw new Error(await response.text());
	}

	return (await response.json()) as T;
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
