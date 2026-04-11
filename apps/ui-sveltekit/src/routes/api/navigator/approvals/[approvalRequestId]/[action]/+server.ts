import { proxySubsystemPost } from '$lib/server/hubProxy';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, params }) => {
	const body = await request.json();
	return proxySubsystemPost(
		'navigator-ai',
		`/approvals/${encodeURIComponent(params.approvalRequestId)}/${encodeURIComponent(params.action)}`,
		request.headers,
		body
	);
};