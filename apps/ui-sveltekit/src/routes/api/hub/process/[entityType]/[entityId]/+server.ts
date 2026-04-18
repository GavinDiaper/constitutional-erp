import { proxyHubGet, proxyIhGet } from '$lib/server/hubProxy';
import { mapEntityTypeToRoute } from '$lib/server/processEntityRoute';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, request }) => {
	const mappedRoute = mapEntityTypeToRoute(params.entityType, params.entityId);
	if (mappedRoute.startsWith('/process/')) {
		const response = await proxyIhGet(mappedRoute, request.headers);
		if (response.ok || !supportsHubQueryFallback(params.entityType)) {
			return response;
		}

		const fallback = await buildProcessFallbackFromHubQuery(params.entityType, params.entityId, request.headers);
		return fallback ?? response;
	}
	return proxyHubGet(mappedRoute, request.headers);
};

function supportsHubQueryFallback(entityType: string): boolean {
	const normalized = entityType.trim().toLowerCase();
	return (
		normalized === 'o2c_quote' ||
		normalized === 'quote' ||
		normalized === 'r2r_journal' ||
		normalized === 'journal' ||
		normalized === 'h2r_employee' ||
		normalized === 'employee'
	);
}

async function buildProcessFallbackFromHubQuery(
	entityType: string,
	entityId: string,
	headers: Headers
): Promise<Response | null> {
	const queryPath = resolveFallbackQueryPath(entityType, entityId);
	if (!queryPath) {
		return null;
	}

	const queryResponse = await proxyHubGet(queryPath, headers);
	if (!queryResponse.ok) {
		return null;
	}

	const payload = await queryResponse.json();
	const attributes = extractAttributes(payload);
	if (!attributes) {
		return null;
	}

	const state =
		typeof attributes.state === 'string' && attributes.state.trim()
			? attributes.state
			: typeof attributes.status === 'string' && attributes.status.trim()
				? attributes.status
				: 'Unknown';

	return Response.json({
		entityType,
		entityId,
		state,
		attributes,
		links: []
	});
}

function resolveFallbackQueryPath(entityType: string, entityId: string): string | null {
	const normalized = entityType.trim().toLowerCase();
	const encodedId = encodeURIComponent(entityId);

	if (normalized === 'o2c_quote' || normalized === 'quote') {
		return `/query/o2c_quote/${encodedId}`;
	}

	if (normalized === 'r2r_journal' || normalized === 'journal') {
		return `/query/r2r_journal/${encodedId}`;
	}

	if (normalized === 'h2r_employee' || normalized === 'employee') {
		return `/query/h2r_employee/${encodedId}`;
	}

	return null;
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
