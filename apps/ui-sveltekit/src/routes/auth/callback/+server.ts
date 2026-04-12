import { redirect, type RequestHandler } from '@sveltejs/kit';

const ACCESS_COOKIE = 'identity_session';
const REFRESH_COOKIE = 'identity_refresh';

export const GET: RequestHandler = async ({ cookies, url }) => {
	const accessToken = url.searchParams.get('token');
	const refreshToken = url.searchParams.get('refresh_token');
	const next = url.searchParams.get('next') ?? '/dashboard';

	if (!accessToken) {
		throw redirect(303, '/');
	}

	const secureCookie = url.protocol === 'https:';

	cookies.set(ACCESS_COOKIE, accessToken, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: secureCookie,
		maxAge: 60 * 15
	});

	if (refreshToken) {
		cookies.set(REFRESH_COOKIE, refreshToken, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			secure: secureCookie,
			maxAge: 60 * 60 * 24 * 7
		});
	}

	throw redirect(303, next.startsWith('/') ? next : '/dashboard');
};
