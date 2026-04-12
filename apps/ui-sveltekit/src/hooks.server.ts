import { redirect, type Handle } from '@sveltejs/kit';

import { isPublicRequest } from '$lib/server/publicRouteManifest';

const SESSION_COOKIE_NAME = 'identity_session';
const LOGIN_PATH = process.env.UI_IDENTITY_LOGIN_PATH ?? 'http://localhost:4174';

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
	const cookieToken = event.cookies.get(SESSION_COOKIE_NAME) ?? null;
	const accessToken = bearerToken ?? cookieToken;
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
