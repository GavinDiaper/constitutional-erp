<script lang="ts">
	import { resolve } from '$app/paths';
	import Card from '$lib/components/shared/Card.svelte';
	import Badge from '$lib/components/shared/Badge.svelte';
	import { dashboardStore } from '$lib/stores/dashboardStore';

	const cards = [
		{ key: 'draftQuotes', label: 'Draft Quotes' },
		{ key: 'approvedPos', label: 'Approved POs' },
		{ key: 'pendingJournals', label: 'Pending Journals' },
		{ key: 'activeEmployees', label: 'Active Employees' }
	] as const;
</script>

<div class="glass-panel p-6 md:p-8">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<div>
			<h1 class="text-3xl font-semibold">Constitutional Canvas</h1>
			<p class="muted mt-2 max-w-2xl text-sm">
				Process-first operational cockpit for O2C, P2P, R2R, and H2R stateful execution.
			</p>
		</div>
		<Badge text="Phase 1" tone="danger" />
	</div>

	<div class="grid-auto-fit mt-6">
		{#each cards as card (card.key)}
			<Card title={card.label} value={$dashboardStore[card.key]} />
		{/each}
	</div>

	<div class="mt-8 flex flex-wrap gap-3">
		<a class="rounded-md bg-white px-4 py-2 font-semibold text-slate-900" href={resolve('/canvas')}>
			Open Canvas
		</a>
		<a class="rounded-md border border-white/35 px-4 py-2" href={resolve('/canvas/o2c_quote/Q-1001')}>
			Open Sample Entity
		</a>
	</div>
</div>
