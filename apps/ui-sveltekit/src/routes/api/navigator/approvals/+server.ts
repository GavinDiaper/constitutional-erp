import { proxySubsystemGet, resolveSubsystemConfig } from '$lib/server/hubProxy';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, url }) => {
	try {
		const query = url.search ? url.search : '';
		const response = await proxySubsystemGet('navigator-ai', `/approvals${query}`, request.headers);
		
		// Log the response status for debugging
		if (!response.ok) {
			console.warn(`Navigator approvals proxy returned status ${response.status}`);
		}
		
		return response;
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error';
		console.error(`Navigator approvals proxy error: ${message}`);
		
		// Get the configured URL for debugging
		const config = resolveSubsystemConfig('navigator-ai');
		
		return new Response(
			JSON.stringify({
				error: 'Failed to fetch approvals',
				detail: message,
				debugInfo: {
					baseUrl: config.baseUrl,
					endpoint: `/approvals${url.search}`,
					fullUrl: `${config.baseUrl}/approvals${url.search}`
				}
			}),
			{
				status: 502,
				headers: { 'content-type': 'application/json' }
			}
		);
	}
};