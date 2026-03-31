import { json } from '@sveltejs/kit';
import { proxyHubRequest } from '$lib/server/hubProxy';
import type { RequestHandler } from './$types';

interface ProcessActionRequestBody {
	href?: string;
	method?: string;
	body?: unknown;
}

const SUPPORTED_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);

export const POST: RequestHandler = async ({ request }) => {
	const payload = (await request.json().catch(() => ({}))) as ProcessActionRequestBody;
	const href = payload.href?.trim();

	if (!href) {
		return json({ title: 'Bad Request', detail: 'Action link href is required.' }, { status: 400 });
	}

	const requestedMethod = (payload.method ?? 'POST').toUpperCase();
	if (!SUPPORTED_METHODS.has(requestedMethod)) {
		return json({ title: 'Bad Request', detail: `Unsupported action method: ${requestedMethod}` }, { status: 400 });
	}

	const method = requestedMethod as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
	const path = normalizeHubPath(href);
	const upstreamResponse = await proxyHubRequest(path, request.headers, method, payload.body);

	if (!upstreamResponse.ok) {
		const contentType = upstreamResponse.headers.get('content-type') ?? '';
		if (isHtmlContentType(contentType)) {
			const html = await upstreamResponse.text();
			const title = extractHtmlTitle(html);
			return json(
				{
					title: 'Action Execution Failed',
					detail: title
						? `Action endpoint returned HTML (${title}). Please verify Integration Hub route mapping.`
						: 'Action endpoint returned unexpected HTML. Please verify Integration Hub route mapping.'
				},
				{ status: 502 }
			);
		}
	}

	return upstreamResponse;
};

function normalizeHubPath(href: string): string {
	let path = href;

	if (/^https?:\/\//i.test(href)) {
		const parsed = new URL(href);
		path = `${parsed.pathname}${parsed.search}`;
	}

	if (path.startsWith('/api/v1/')) {
		path = path.slice('/api/v1'.length);
	} else if (path === '/api/v1') {
		path = '/';
	} else if (path.startsWith('api/v1/')) {
		path = `/${path.slice('api/v1/'.length)}`;
	}

	if (!path.startsWith('/')) {
		path = `/${path}`;
	}

	if (/^\/process\/[^/]+\/[^/]+\/actions\/[^/?#]+(?:\?.*)?$/i.test(path)) {
		path = `/hub${path}`;
	}

	return path;
}

function isHtmlContentType(contentType: string): boolean {
	return contentType.toLowerCase().includes('text/html');
}

function extractHtmlTitle(html: string): string | null {
	const match = html.match(/<title>([^<]+)<\/title>/i);
	return match?.[1]?.trim() || null;
}
