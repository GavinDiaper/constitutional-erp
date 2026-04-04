<script lang="ts">
	import { resolve } from '$app/paths';
	import MermaidDiagram from '$lib/components/shared/MermaidDiagram.svelte';
	import type { PageData } from './$types';

	export let data: PageData;
</script>

<section class="rounded-2xl border border-white/30 bg-white/80 p-6 md:p-10">
	<p class="text-xs uppercase tracking-[0.18em] text-slate-600">{data.diagram.system}</p>
	<h1 class="mt-2 text-3xl font-semibold text-slate-900">{data.diagram.title}</h1>
	<p class="mt-3 text-sm text-slate-700">{data.diagram.summary}</p>
	<div class="mt-5 flex gap-3">
		<a class="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-100" href={resolve('/diagrams')}>
			Back To Diagram Explorer
		</a>
		<a class="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-100" href={resolve('/')}>
			Home
		</a>
	</div>
</section>

<section class="mt-6 rounded-2xl border border-white/30 bg-white/75 p-6 md:p-8">
	<MermaidDiagram title={data.diagram.title} definition={data.diagram.definition} />
</section>
