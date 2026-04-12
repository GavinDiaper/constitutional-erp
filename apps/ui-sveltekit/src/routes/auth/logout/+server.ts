import { redirect, type RequestHandler } from '@sveltejs/kit';

const ACCESS_COOKIE_NAME = 'identity_session';
const REFRESH_COOKIE_NAME = 'identity_refresh';
const IDENTITY_BASE_URL = (process.env.IDENTITY_BASE_URL ?? 'http://localhost:4008').replace(/\/$/, '');
const LOGIN_PATH = process.env.UI_IDENTITY_LOGIN_PATH ?? '/';

function buildLoginRedirect(origin: string): string {
	if (LOGIN_PATH.startsWith('http://') || LOGIN_PATH.startsWith('https://')) {
		return LOGIN_PATH;
	}

	return new URL(LOGIN_PATH, origin).toString();
}

async function performLogout(cookies: Parameters<RequestHandler>[0]['cookies']): Promise<void> {
	const refreshToken = cookies.get(REFRESH_COOKIE_NAME) ?? '';

	if (refreshToken) {
		try {
			await fetch(`${IDENTITY_BASE_URL}/auth/logout`, {
				method: 'POST',
				headers: {
					'content-type': 'application/json'
				},
				body: JSON.stringify({ refreshToken })
			});
		} catch {
			// Ignore upstream logout errors and always clear local session cookies.
		}
	}

	cookies.delete(ACCESS_COOKIE_NAME, { path: '/' });
	cookies.delete(REFRESH_COOKIE_NAME, { path: '/' });
}

export const GET: RequestHandler = async ({ cookies, url }) => {
	await performLogout(cookies);
	throw redirect(303, buildLoginRedirect(url.origin));
};

export const POST: RequestHandler = async ({ cookies, url }) => {
	await performLogout(cookies);
	throw redirect(303, buildLoginRedirect(url.origin));
};
