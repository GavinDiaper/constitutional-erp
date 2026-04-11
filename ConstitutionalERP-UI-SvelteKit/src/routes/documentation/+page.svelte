<script lang="ts">
	import { resolve } from '$app/paths';
	import DiagramBreadcrumb from '$lib/components/shared/DiagramBreadcrumb.svelte';
</script>

<DiagramBreadcrumb items={[{ label: 'Home', href: resolve('/') }, { label: 'Documentation' }]} />

<section class="rounded-2xl border dark:border-white/30 border-slate-300 dark:bg-white/80 bg-white/95 p-6 md:p-10">
	<h1 class="text-3xl font-semibold text-slate-900">Documentation</h1>
	<p class="mt-3 max-w-3xl text-sm text-slate-700">
		Browse architecture references, process flow documentation, and markdown content files.
	</p>
</section>

<section class="mt-6 rounded-2xl border dark:border-white/30 border-slate-300 dark:bg-white/75 bg-white/90 p-6 md:p-8">
	<h2 class="text-xl font-semibold text-slate-900">Documentation Directory</h2>
	<div class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
		<a
			class="rounded-lg border border-indigo-500/40 bg-indigo-50/70 p-4 transition hover:-translate-y-0.5 hover:shadow"
			href={resolve('/diagrams')}
		>
			<p class="text-sm font-semibold text-slate-900">Architecture</p>
			<p class="mt-2 text-xs text-slate-700">Current architecture diagram links across systems and domains.</p>
		</a>
		<a
			class="rounded-lg border border-sky-500/40 bg-sky-50/70 p-4 transition hover:-translate-y-0.5 hover:shadow"
			href={resolve('/diagrams/process-flows')}
		>
			<p class="text-sm font-semibold text-slate-900">Process</p>
			<p class="mt-2 text-xs text-slate-700">Current domain process flow links and variants.</p>
		</a>
		<a
			class="rounded-lg border border-emerald-500/40 bg-emerald-50/70 p-4 transition hover:-translate-y-0.5 hover:shadow"
			href={resolve('/documentation/content')}
		>
			<p class="text-sm font-semibold text-slate-900">Content</p>
			<p class="mt-2 text-xs text-slate-700">Open markdown files available in the documentation content directory.</p>
		</a>
	</div>
</section>
