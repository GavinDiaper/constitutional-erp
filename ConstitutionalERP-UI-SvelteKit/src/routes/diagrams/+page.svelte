<script lang="ts">
	import { resolve } from '$app/paths';
	import { diagramCatalog } from '$lib/diagrams/catalog';

	const grouped = {
		foundation: diagramCatalog.filter((d) => d.system === 'FoundationERP'),
		constitutional: diagramCatalog.filter((d) => d.system === 'ConstitutionalLayer'),
		cross: diagramCatalog.filter((d) => d.system === 'Cross-System')
	};
</script>

<section class="rounded-2xl border border-white/30 bg-white/80 p-6 md:p-10">
	<h1 class="text-3xl font-semibold text-slate-900">Architecture Diagram Explorer</h1>
	<p class="mt-3 max-w-3xl text-sm text-slate-700">
		Select a box to open the dedicated diagram page for that system or domain.
	</p>
</section>

<section class="mt-6 rounded-2xl border border-white/30 bg-white/75 p-6 md:p-8">
	<h2 class="text-xl font-semibold text-slate-900">FoundationERP Domains</h2>
	<div class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
		{#each grouped.foundation as item (item.id)}
			<a class={`rounded-lg border p-4 transition hover:-translate-y-0.5 hover:shadow ${item.accentClass}`} href={resolve(`/diagrams/${item.id}`)}>
				<p class="text-sm font-semibold text-slate-900">{item.title}</p>
				<p class="mt-2 text-xs text-slate-700">{item.summary}</p>
			</a>
		{/each}
	</div>
</section>

<section class="mt-6 rounded-2xl border border-white/30 bg-white/75 p-6 md:p-8">
	<h2 class="text-xl font-semibold text-slate-900">ConstitutionalLayer Systems</h2>
	<div class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
		{#each grouped.constitutional as item (item.id)}
			<a class={`rounded-lg border p-4 transition hover:-translate-y-0.5 hover:shadow ${item.accentClass}`} href={resolve(`/diagrams/${item.id}`)}>
				<p class="text-sm font-semibold text-slate-900">{item.title}</p>
				<p class="mt-2 text-xs text-slate-700">{item.summary}</p>
			</a>
		{/each}
	</div>
</section>

<section class="mt-6 rounded-2xl border border-white/30 bg-white/75 p-6 md:p-8">
	<h2 class="text-xl font-semibold text-slate-900">Cross-System</h2>
	<div class="mt-4 grid gap-3 sm:grid-cols-2">
		{#each grouped.cross as item (item.id)}
			<a class={`rounded-lg border p-4 transition hover:-translate-y-0.5 hover:shadow ${item.accentClass}`} href={resolve(`/diagrams/${item.id}`)}>
				<p class="text-sm font-semibold text-slate-900">{item.title}</p>
				<p class="mt-2 text-xs text-slate-700">{item.summary}</p>
			</a>
		{/each}
	</div>
</section>
