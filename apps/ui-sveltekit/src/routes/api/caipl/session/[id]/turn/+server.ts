import { proxySubsystemPost } from '$lib/server/hubProxy';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, params }) => {
	const body = await request.json();
	return proxySubsystemPost(
		'navigator-ai',
		`/caipl/session/${encodeURIComponent(params.id)}/turn`,
		request.headers,
		body
	);
};
