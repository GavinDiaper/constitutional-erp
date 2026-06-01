import type { ActorContext } from '$lib/stores/actorStore';

const apiBaseUrl = (import.meta.env.PUBLIC_ERP_MAPPING_API_URL as string | undefined) ?? 'http://localhost:3011';
const apiKey = (import.meta.env.PUBLIC_ERP_MAPPING_API_KEY as string | undefined) ?? 'change-me';

function toAbsoluteUrl(path: string): string {
	if (/^https?:\/\//i.test(path)) {
		return path;
	}

	const normalizedPath = path.startsWith('/') ? path : `/${path}`;
	return `${apiBaseUrl}${normalizedPath}`;
}

export async function fetchHubJson<T>(path: string, actor: ActorContext, init?: RequestInit): Promise<T> {
	const response = await fetch(toAbsoluteUrl(path), {
		...init,
		headers: {
			'content-type': 'application/json',
			'x-api-key': apiKey,
			'x-actor-id': actor.actorId,
			'x-actor-tier': String(actor.authorityTier),
			...(init?.headers ?? {})
		}
	});

	if (!response.ok) {
		const contentType = response.headers.get('content-type') ?? '';
		if (contentType.includes('application/json')) {
			const problem = await response.json();
			throw new Error(formatProblemMessage(problem, `ERP Mapping API request failed (${response.status})`));
		}

		const bodyText = await response.text();
		const detail = bodyText.trim() ? bodyText : 'No response body';
		throw new Error(`ERP Mapping API request failed (${response.status}): ${detail}`);
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
