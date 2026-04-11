import { proxySubsystemGet } from '$lib/server/hubProxy';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, params }) => {
	return proxySubsystemGet('navigator-ai', `/approvals/${encodeURIComponent(params.approvalRequestId)}`, request.headers);
};