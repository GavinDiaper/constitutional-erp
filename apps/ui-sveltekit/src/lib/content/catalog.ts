export type DocumentationContentItem = {
	slug: string;
	title: string;
};

const markdownModules = import.meta.glob('./markdown/**/*', {
	query: '?raw',
	import: 'default',
	eager: true
}) as Record<string, string>;

function isRenderableMarkdownPath(path: string): boolean {
	const fileName = path.split('/').at(-1) ?? '';

	if (!fileName || fileName.startsWith('.')) {
		return false;
	}

	const extensionIndex = fileName.lastIndexOf('.');
	if (extensionIndex === -1) {
		return true;
	}

	return fileName.slice(extensionIndex + 1).toLowerCase() === 'md';
}

function slugFromPath(path: string): string {
	return path
		.replace('./markdown/', '')
		.replace(/\.md$/i, '')
		.split('/')
		.map((segment) => segment.trim().toLowerCase().replace(/\s+/g, '-'))
		.join('/');
}

function titleFromSlug(slug: string): string {
	const leaf = slug.split('/').at(-1) ?? slug;
	return leaf
		.split('-')
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(' ');
}

const markdownBySlug = new Map<string, string>();

for (const [path, source] of Object.entries(markdownModules)) {
	if (!isRenderableMarkdownPath(path)) {
		continue;
	}

	const slug = slugFromPath(path);
	markdownBySlug.set(slug, source);
}

export const documentationContentItems: DocumentationContentItem[] = Array.from(markdownBySlug.keys())
	.sort((a, b) => a.localeCompare(b))
	.map((slug) => ({
		slug,
		title: titleFromSlug(slug)
	}));

export function getMarkdownBySlug(slug: string): string | null {
	return markdownBySlug.get(slug) ?? null;
}
