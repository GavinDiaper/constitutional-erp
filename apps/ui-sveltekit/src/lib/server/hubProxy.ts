import { env as privateEnv } from '$env/dynamic/private';

export interface HubConfig {
	baseUrl: string;
	apiKey: string;
	ingressId: string;
}

export interface IhConfig {
	baseUrl: string;
	apiKey: string;
}

export type SubsystemKey =
	| 'authority-engine'
	| 'governance-engine'
	| 'event-processor'
	| 'mesh-gateway'
	| 'process-graph'
	| 'navigator-ai';

export interface SubsystemConfig {
	baseUrl: string;
	apiKey: string;
}

function buildProxyErrorResponse(status: number, message: string): Response {
	return new Response(JSON.stringify({ detail: message }), {
		status,
		headers: {
			'content-type': 'application/json'
		}
	});
}

export function resolveHubConfig(source: Record<string, string | undefined> = privateEnv): HubConfig {
	return {
		baseUrl: source.HUB_BASE_URL ?? 'http://localhost:3000/api/v1',
		apiKey: source.HUB_API_KEY ?? 'change-me',
		ingressId: source.HUB_INGRESS_ID ?? 'foundation-ingress'
	};
}

export function resolveIhConfig(source: Record<string, string | undefined> = privateEnv): IhConfig {
	return {
		baseUrl: source.IH_BASE_URL ?? 'http://localhost:4017',
		apiKey: source.IH_API_KEY ?? 'change-me'
	};
}

export function resolveSubsystemConfig(
	subsystem: SubsystemKey,
	source: Record<string, string | undefined> = privateEnv
): SubsystemConfig {
	const map: Record<SubsystemKey, SubsystemConfig> = {
		'authority-engine': {
			baseUrl: source.AUTHORITY_ENGINE_URL ?? 'http://localhost:4001/api/v1',
			apiKey: source.AUTHORITY_ENGINE_API_KEY ?? 'change-me'
		},
		'governance-engine': {
			baseUrl: source.GOVERNANCE_ENGINE_URL ?? 'http://localhost:4002/api/v1',
			apiKey: source.GOVERNANCE_ENGINE_API_KEY ?? 'change-me'
		},
		'event-processor': {
			baseUrl: source.EVENT_PROCESSOR_URL ?? 'http://localhost:4004/api/v1',
			apiKey: source.EVENT_PROCESSOR_API_KEY ?? 'change-me'
		},
		'mesh-gateway': {
			baseUrl: source.MESH_GATEWAY_URL ?? 'http://localhost:4003/api/v1',
			apiKey: source.MESH_GATEWAY_API_KEY ?? 'change-me'
		},
		'process-graph': {
			baseUrl: source.PROCESS_GRAPH_URL ?? 'http://localhost:4005/api/v1',
			apiKey: source.PROCESS_GRAPH_API_KEY ?? 'change-me'
		},
		'navigator-ai': {
			baseUrl: source.NAVIGATOR_AI_URL ?? 'http://localhost:4016/api/v1',
			apiKey: source.NAVIGATOR_AI_API_KEY ?? 'change-me'
		}
	};

	return map[subsystem];
}

export function buildHubHeaders(incomingHeaders: Headers, config: HubConfig): Headers {
	const headers = new Headers();
	headers.set('accept', 'application/json');
	headers.set('x-api-key', config.apiKey);
	headers.set('x-ingress-id', config.ingressId);

	const actorId = incomingHeaders.get('x-actor-id') ?? 'principal.system';
	const actorTier = incomingHeaders.get('x-actor-tier') ?? '5';

	headers.set('x-actor-id', actorId);
	headers.set('x-actor-tier', actorTier);

	return headers;
}

export function buildIhHeaders(incomingHeaders: Headers, config: IhConfig): Headers {
	const headers = new Headers();
	headers.set('accept', 'application/json');
	headers.set('x-api-key', config.apiKey);

	const actorId = incomingHeaders.get('x-actor-id') ?? 'principal.system';
	const actorTier = incomingHeaders.get('x-actor-tier') ?? '5';

	headers.set('x-actor-id', actorId);
	headers.set('x-actor-tier', actorTier);

	return headers;
}

export function buildSubsystemHeaders(incomingHeaders: Headers, config: SubsystemConfig): Headers {
	const headers = new Headers();
	headers.set('accept', 'application/json');
	headers.set('x-api-key', config.apiKey);

	const actorId = incomingHeaders.get('x-actor-id') ?? 'principal.system';
	const actorTier = incomingHeaders.get('x-actor-tier') ?? '5';

	headers.set('x-actor-id', actorId);
	headers.set('x-actor-tier', actorTier);

	return headers;
}

export async function proxyHubGet(path: string, incomingHeaders: Headers): Promise<Response> {
	return proxyHubRequest(path, incomingHeaders, 'GET');
}

export async function proxyIhGet(path: string, incomingHeaders: Headers): Promise<Response> {
	return proxyIhRequest(path, incomingHeaders, 'GET');
}

export async function proxySubsystemGet(
	subsystem: SubsystemKey,
	path: string,
	incomingHeaders: Headers
): Promise<Response> {
	const config = resolveSubsystemConfig(subsystem);
	const baseUrl = config.baseUrl.replace(/\/$/, '');
	const requestUrl = `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
	const headers = buildSubsystemHeaders(incomingHeaders, config);

	let response: Response;
	try {
		response = await fetch(requestUrl, {
			method: 'GET',
			headers
		});
	} catch (error) {
		const detail = error instanceof Error ? error.message : `Failed to reach ${subsystem}`;
		return buildProxyErrorResponse(502, `Navigator proxy GET failed for ${requestUrl}: ${detail}`);
	}

	const responseBody = await response.text();
	const contentType = response.headers.get('content-type') ?? 'application/json';

	return new Response(responseBody, {
		status: response.status,
		headers: {
			'content-type': contentType
		}
	});
}

export async function proxySubsystemPost(
	subsystem: SubsystemKey,
	path: string,
	incomingHeaders: Headers,
	body: unknown
): Promise<Response> {
	const config = resolveSubsystemConfig(subsystem);
	const baseUrl = config.baseUrl.replace(/\/$/, '');
	const requestUrl = `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
	const headers = buildSubsystemHeaders(incomingHeaders, config);
	headers.set('content-type', 'application/json');

	let response: Response;
	try {
		response = await fetch(requestUrl, {
			method: 'POST',
			headers,
			body: JSON.stringify(body ?? {})
		});
	} catch (error) {
		const detail = error instanceof Error ? error.message : `Failed to reach ${subsystem}`;
		return buildProxyErrorResponse(502, `Navigator proxy POST failed for ${requestUrl}: ${detail}`);
	}

	const responseBody = await response.text();
	const contentType = response.headers.get('content-type') ?? 'application/json';

	return new Response(responseBody, {
		status: response.status,
		headers: {
			'content-type': contentType
		}
	});
}

export async function proxyHubRequest(
	path: string,
	incomingHeaders: Headers,
	method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
	body?: unknown
): Promise<Response> {
	const config = resolveHubConfig();
	const baseUrl = config.baseUrl.replace(/\/$/, '');
	const requestUrl = `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
	const headers = buildHubHeaders(incomingHeaders, config);

	if (method !== 'GET') {
		headers.set('content-type', 'application/json');
	}

	let response: Response;
	try {
		response = await fetch(requestUrl, {
			method,
			headers,
			body: method === 'GET' ? undefined : JSON.stringify(body ?? {})
		});
	} catch (error) {
		const detail = error instanceof Error ? error.message : 'Failed to reach hub';
		return buildProxyErrorResponse(502, `Navigator proxy ${method} failed for ${requestUrl}: ${detail}`);
	}

	const responseBody = await response.text();
	const contentType = response.headers.get('content-type') ?? 'application/json';

	return new Response(responseBody, {
		status: response.status,
		headers: {
			'content-type': contentType
		}
	});
}

export async function proxyIhRequest(
	path: string,
	incomingHeaders: Headers,
	method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
	body?: unknown
): Promise<Response> {
	const config = resolveIhConfig();
	const baseUrl = config.baseUrl.replace(/\/$/, '');
	const requestUrl = `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
	const headers = buildIhHeaders(incomingHeaders, config);

	if (method !== 'GET') {
		headers.set('content-type', 'application/json');
	}

	let response: Response;
	try {
		response = await fetch(requestUrl, {
			method,
			headers,
			body: method === 'GET' ? undefined : JSON.stringify(body ?? {})
		});
	} catch (error) {
		const detail = error instanceof Error ? error.message : 'Failed to reach integration hub';
		return buildProxyErrorResponse(502, `Navigator proxy ${method} failed for ${requestUrl}: ${detail}`);
	}

	const responseBody = await response.text();
	const contentType = response.headers.get('content-type') ?? 'application/json';

	return new Response(responseBody, {
		status: response.status,
		headers: {
			'content-type': contentType
		}
	});
}
