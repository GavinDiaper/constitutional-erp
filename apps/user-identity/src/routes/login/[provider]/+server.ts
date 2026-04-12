import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { buildUiCallbackUrl, getIdentityBaseUrl } from '$lib/server/identityConfig';

export const GET: RequestHandler = async ({ params, url }) => {
	const provider = params.provider;
	if (!['google', 'microsoft', 'apple'].includes(provider)) {
		throw redirect(302, '/');
	}

	const nextPath = url.searchParams.get('next')?.trim() || '/dashboard';
	const callbackUrl = new URL(buildUiCallbackUrl());
	callbackUrl.searchParams.set('next', nextPath.startsWith('/') ? nextPath : '/dashboard');

	const loginUrl = new URL(`${getIdentityBaseUrl()}/auth/login/${provider}`);
	loginUrl.searchParams.set('next', callbackUrl.toString());
	loginUrl.searchParams.set('email', url.searchParams.get('email') ?? `demo.${provider}@constitutionalerp.local`);

	throw redirect(302, loginUrl.toString());
};
