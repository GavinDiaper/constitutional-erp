import { error } from '@sveltejs/kit';
import { marked } from 'marked';

import { getMarkdownBySlug } from '$lib/content/catalog';

import type { PageLoad } from './$types';

export const load: PageLoad = ({ params }) => {
	const markdown = getMarkdownBySlug(params.slug);

	if (!markdown) {
		throw error(404, `Documentation page not found: ${params.slug}`);
	}

	return {
		slug: params.slug,
		html: marked.parse(markdown)
	};
};
