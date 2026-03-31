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

	const method = (payload.method ?? 'POST').toUpperCase();
	if (!SUPPORTED_METHODS.has(method)) {
		return json({ title: 'Bad Request', detail: `Unsupported action method: ${method}` }, { status: 400 });
	}

	const path = normalizeHubPath(href);
	return proxyHubRequest(path, request.headers, method, payload.body);
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

	return path;
}
