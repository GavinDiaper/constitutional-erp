<script lang="ts">
	import { resolve } from '$app/paths';
	import DiagramBreadcrumb from '$lib/components/shared/DiagramBreadcrumb.svelte';
	import { listFlowsByDomain } from '$lib/flows';
	import type { CanonicalFlowDomain } from '$lib/types/hub';

	const domainCards: Array<{
		slug: 'o2c' | 'p2p' | 'r2r' | 'h2r';
		label: CanonicalFlowDomain;
		summary: string;
		accentClass: string;
	}> = [
		{
			slug: 'o2c',
			label: 'O2C',
			summary: 'Quote to cash lifecycle from quote creation through invoicing and payment collection.',
			accentClass: 'border-indigo-500/40 bg-indigo-50/70'
		},
		{
			slug: 'p2p',
			label: 'P2P',
			summary: 'Requisition, purchasing, supplier invoicing, and AP payment sequence.',
			accentClass: 'border-sky-500/40 bg-sky-50/70'
		},
		{
			slug: 'r2r',
			label: 'R2R',
			summary: 'Journal and record-to-report processing from posting through close activities.',
			accentClass: 'border-blue-700/40 bg-blue-100/70'
		},
		{
			slug: 'h2r',
			label: 'H2R',
			summary: 'Employee lifecycle and workforce process flow from hiring through status changes.',
			accentClass: 'border-cyan-600/40 bg-cyan-50/70'
		}
	];

	const cardsWithCounts = domainCards.map((domain) => ({
		...domain,
		flowCount: listFlowsByDomain(domain.label).length
	}));
</script>

<DiagramBreadcrumb
	items={[
		{ label: 'Home', href: resolve('/') },
		{ label: 'Diagram Explorer', href: resolve('/diagrams') },
		{ label: 'Domain Process Flows' }
	]}
/>

<section class="rounded-2xl border dark:border-white/30 border-slate-300 dark:bg-white/80 bg-white/95 p-6 md:p-10">
	<p class="text-xs uppercase tracking-[0.18em] text-slate-600">Diagram Explorer</p>
	<h1 class="mt-2 text-3xl font-semibold text-slate-900">Domain Process Flows</h1>
	<p class="mt-3 max-w-3xl text-sm text-slate-700">
		Explore generated domain flow variants extracted from FoundationERP end-to-end Postman folders.
	</p>
	<div class="mt-5 flex gap-3">
		<a class="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-100" href={resolve('/diagrams')}>
			Back To Diagram Explorer Landing
		</a>
		<a class="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-100" href={resolve('/canvas')}>
			Canvas Home
		</a>
	</div>
</section>

<section class="mt-6 rounded-2xl border dark:border-white/30 border-slate-300 dark:bg-white/75 bg-white/90 p-6 md:p-8">
	<h2 class="text-xl font-semibold text-slate-900">Select A Domain</h2>
	<div class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
		{#each cardsWithCounts as item (item.slug)}
			<a
				class={`rounded-lg border p-4 transition hover:-translate-y-0.5 hover:shadow ${item.accentClass}`}
				href={resolve('/diagrams/process-flows/[domain]', { domain: item.slug })}
			>
				<p class="text-sm font-semibold text-slate-900">{item.label}</p>
				<p class="mt-2 text-xs text-slate-700">{item.summary}</p>
				<p class="mt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
					{item.flowCount} variant{item.flowCount === 1 ? '' : 's'} available
				</p>
			</a>
		{/each}
	</div>
</section>
