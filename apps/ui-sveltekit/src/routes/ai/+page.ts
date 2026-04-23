import { env as publicEnv } from '$env/dynamic/public';
import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';

export const load: PageLoad = () => {
	const caiplEnabled = (publicEnv.PUBLIC_CAILP_ENABLED ?? '').toLowerCase() === 'true';
	if (!caiplEnabled) {
		throw redirect(307, '/');
	}

	return {};
};
