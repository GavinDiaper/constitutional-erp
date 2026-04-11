import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';
import { diagramById } from '$lib/diagrams/catalog';

export const load: PageLoad = ({ params }) => {
	const diagram = diagramById[params.diagramId];
	if (!diagram) {
		throw error(404, 'Diagram not found');
	}

	return { diagram };
};
