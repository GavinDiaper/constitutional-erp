import type { PageLoad } from './$types';
import { env as publicEnv } from '$env/dynamic/public';
import { redirect } from '@sveltejs/kit';

export const load: PageLoad = ({ params }) => {
	const linaEnabled = (publicEnv.PUBLIC_LINA_ENABLED ?? '').toLowerCase() === 'true';
	if (!linaEnabled) {
		throw redirect(307, '/');
	}

	return {
		sessionId: params.sessionId ?? null
	};
};
