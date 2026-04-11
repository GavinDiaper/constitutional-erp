import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';
import type { CanonicalFlowDomain } from '$lib/types/hub';

const domainBySlug: Record<string, CanonicalFlowDomain> = {
	o2c: 'O2C',
	p2p: 'P2P',
	r2r: 'R2R',
	h2r: 'H2R'
};

export const load: PageLoad = ({ params }) => {
	const slug = (params.domain ?? '').toLowerCase();
	const domain = domainBySlug[slug];

	if (!domain) {
		throw error(404, 'Process flow domain not found');
	}

	return { domain, slug };
};
