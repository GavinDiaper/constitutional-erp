import { redirect, type Handle } from '@sveltejs/kit';

import { isPublicRequest } from '$lib/server/publicRouteManifest';

const ACCESS_COOKIE_NAME = 'identity_session';
const REFRESH_COOKIE_NAME = 'identity_refresh';
const LOGIN_PATH = process.env.UI_IDENTITY_LOGIN_PATH ?? 'http://localhost:4174';
const IDENTITY_BASE_URL = (process.env.IDENTITY_BASE_URL ?? 'http://localhost:4008').replace(/\/$/, '');

function cookieSecure(url: URL): boolean {
	return url.protocol === 'https:';
}

async function tryRefreshSession(event: Parameters<Handle>[0]['event']): Promise<string | null> {
	const refreshToken = event.cookies.get(REFRESH_COOKIE_NAME);
	if (!refreshToken) {
		return null;
	}

	let response: Response;
	try {
		response = await fetch(`${IDENTITY_BASE_URL}/auth/refresh`, {
			method: 'POST',
			headers: {
				'content-type': 'application/json'
			},
			body: JSON.stringify({ refreshToken })
		});
	} catch {
		return null;
	}

	if (!response.ok) {
		event.cookies.delete(ACCESS_COOKIE_NAME, { path: '/' });
		event.cookies.delete(REFRESH_COOKIE_NAME, { path: '/' });
		return null;
	}

	const payload = (await response.json()) as {
		accessToken?: string;
		refreshToken?: string;
	};

	if (!payload.accessToken) {
		return null;
	}

	const secure = cookieSecure(event.url);
	event.cookies.set(ACCESS_COOKIE_NAME, payload.accessToken, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure,
		maxAge: 60 * 15
	});

	if (payload.refreshToken) {
		event.cookies.set(REFRESH_COOKIE_NAME, payload.refreshToken, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			secure,
			maxAge: 60 * 60 * 24 * 7
		});
	}

	return payload.accessToken;
}

function getBearerToken(authHeader: string | null): string | null {
	if (!authHeader) {
		return null;
	}

	const [scheme, token] = authHeader.split(' ', 2);
	if (scheme?.toLowerCase() !== 'bearer' || !token) {
		return null;
	}

	return token;
}

export const handle: Handle = async ({ event, resolve }) => {
	const bearerToken = getBearerToken(event.request.headers.get('authorization'));
	const cookieToken = event.cookies.get(ACCESS_COOKIE_NAME) ?? null;
	let accessToken = bearerToken ?? cookieToken;

	if (!accessToken && !bearerToken) {
		accessToken = await tryRefreshSession(event);
	}

	const isPublic = isPublicRequest(event.url.pathname, event.request.method);

	event.locals.accessToken = accessToken;
	event.locals.isAuthenticated = Boolean(accessToken);

	if (isPublic || accessToken) {
		return resolve(event);
	}

	if (event.url.pathname.startsWith('/api/')) {
		return new Response(JSON.stringify({ error: 'Authentication required' }), {
			status: 401,
			headers: {
				'content-type': 'application/json'
			}
		});
	}

	const nextPath = `${event.url.pathname}${event.url.search}`;
	const loginUrl = LOGIN_PATH.startsWith('http://') || LOGIN_PATH.startsWith('https://')
		? new URL(LOGIN_PATH)
		: new URL(LOGIN_PATH, event.url.origin);
	loginUrl.searchParams.set('next', nextPath);
	throw redirect(303, loginUrl.toString());
};
