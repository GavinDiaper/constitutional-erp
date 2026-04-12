<script lang="ts">
	import { resolve } from '$app/paths';
	import DiagramBreadcrumb from '$lib/components/shared/DiagramBreadcrumb.svelte';
 	import type { PageData } from './$types';

	export let data: PageData;
</script>

<DiagramBreadcrumb
	items={[
		{ label: 'Home', href: resolve('/') },
		{ label: 'Documentation', href: resolve('/documentation') },
		{ label: 'Content', href: resolve('/documentation/content') },
		{ label: data.slug }
	]}
/>

<section class="rounded-2xl border dark:border-white/30 border-slate-300 dark:bg-white/80 bg-white/95 p-6 md:p-10">
	<h1 class="text-3xl font-semibold text-slate-900">{data.slug}</h1>
	<p class="mt-3 max-w-3xl text-sm text-slate-700">Markdown content rendered from the content directory.</p>
</section>

<article class="prose prose-slate mt-6 max-w-none rounded-2xl border dark:border-white/30 border-slate-300 dark:bg-white/75 bg-white/90 p-6 md:p-8">
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html data.html}
</article>
