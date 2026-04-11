import { resolveSubsystemConfig } from '$lib/server/hubProxy';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	try {
		const config = resolveSubsystemConfig('navigator-ai');
		// Navigator /health endpoint is at baseUrl root, not under /api/v1
		const baseOnly = config.baseUrl.replace('/api/v1', '');
		const healthUrl = `${baseOnly}/health`;

		console.log(`Testing Navigator health at: ${healthUrl}`);

		const response = await fetch(healthUrl, {
			method: 'GET',
			headers: {
				'Accept': 'application/json',
				'User-Agent': 'ConstitutionalERP-UI/1.0'
			}
		});

		const contentType = response.headers.get('content-type') || 'unknown';
		const body = await response.text();

		return new Response(
			JSON.stringify({
				status: 'ok',
				navigatorApi: {
					baseUrl: config.baseUrl,
					healthUrl: healthUrl,
					httpStatus: response.status,
					contentType: contentType,
					isJson: contentType.includes('application/json'),
					responsePreview: body.substring(0, 200),
					accessible: response.ok
				}
			}),
			{
				status: 200,
				headers: { 'content-type': 'application/json' }
			}
		);
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error';

		return new Response(
			JSON.stringify({
				status: 'error',
				error: message,
				detail: (error instanceof Error && error.stack) || 'No stack trace available'
			}),
			{
				status: 500,
				headers: { 'content-type': 'application/json' }
			}
		);
	}
};
