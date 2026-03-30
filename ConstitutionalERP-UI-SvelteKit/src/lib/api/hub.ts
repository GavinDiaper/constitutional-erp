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
			throw new Error(problem?.detail ?? problem?.title ?? 'Integration Hub request failed');
		}

		throw new Error(await response.text());
	}

	return (await response.json()) as T;
}
