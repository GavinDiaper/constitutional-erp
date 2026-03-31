import { env as privateEnv } from '$env/dynamic/private';

export interface HubConfig {
	baseUrl: string;
	apiKey: string;
	ingressId: string;
}

export function resolveHubConfig(source: Record<string, string | undefined> = privateEnv): HubConfig {
	return {
		baseUrl: source.HUB_BASE_URL ?? 'http://localhost:3000/api/v1',
		apiKey: source.HUB_API_KEY ?? 'change-me',
		ingressId: source.HUB_INGRESS_ID ?? 'foundation-ingress'
	};
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

export async function proxyHubGet(path: string, incomingHeaders: Headers): Promise<Response> {
	return proxyHubRequest(path, incomingHeaders, 'GET');
}

export async function proxyHubRequest(
	path: string,
	incomingHeaders: Headers,
	method: 'GET' | 'POST',
	body?: unknown
): Promise<Response> {
	const config = resolveHubConfig();
	const baseUrl = config.baseUrl.replace(/\/$/, '');
	const requestUrl = `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
	const headers = buildHubHeaders(incomingHeaders, config);

	if (method !== 'GET') {
		headers.set('content-type', 'application/json');
	}

	const response = await fetch(requestUrl, {
		method,
		headers,
		body: method === 'GET' ? undefined : JSON.stringify(body ?? {})
	});

	const responseBody = await response.text();
	const contentType = response.headers.get('content-type') ?? 'application/json';

	return new Response(responseBody, {
		status: response.status,
		headers: {
			'content-type': contentType
		}
	});
}
