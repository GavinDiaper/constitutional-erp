import { proxyHubGet, proxyIhGet } from '$lib/server/hubProxy';
import { mapEntityTypeToRoute } from '$lib/server/processEntityRoute';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, request }) => {
	const mappedRoute = mapEntityTypeToRoute(params.entityType, params.entityId);
	if (mappedRoute.startsWith('/process/')) {
		const response = await proxyIhGet(mappedRoute, request.headers);
		if (response.ok || !isQuoteEntityType(params.entityType)) {
			return response;
		}

		const fallback = await buildQuoteProcessFallback(params.entityType, params.entityId, request.headers);
		return fallback ?? response;
	}
	return proxyHubGet(mappedRoute, request.headers);
};

function isQuoteEntityType(entityType: string): boolean {
	const normalized = entityType.trim().toLowerCase();
	return normalized === 'o2c_quote' || normalized === 'quote';
}

async function buildQuoteProcessFallback(
	entityType: string,
	entityId: string,
	headers: Headers
): Promise<Response | null> {
	const queryResponse = await proxyHubGet(`/query/o2c_quote/${encodeURIComponent(entityId)}`, headers);
	if (!queryResponse.ok) {
		return null;
	}

	const payload = await queryResponse.json();
	const attributes = extractAttributes(payload);
	if (!attributes) {
		return null;
	}

	const state = typeof attributes.state === 'string' && attributes.state.trim() ? attributes.state : 'Unknown';

	return Response.json({
		entityType,
		entityId,
		state,
		attributes,
		links: []
	});
}

function extractAttributes(payload: unknown): Record<string, unknown> | null {
	if (!payload || typeof payload !== 'object') {
		return null;
	}

	const record = payload as Record<string, unknown>;
	if ('data' in record && record.data && typeof record.data === 'object' && !Array.isArray(record.data)) {
		return record.data as Record<string, unknown>;
	}

	return Array.isArray(record) ? null : record;
}
