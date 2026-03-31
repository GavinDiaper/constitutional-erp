<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { getDashboardSummary } from '$lib/api/dashboard';
	import Card from '$lib/components/shared/Card.svelte';
	import Badge from '$lib/components/shared/Badge.svelte';
	import { actorStore } from '$lib/stores/actorStore';
	import { dashboardStore } from '$lib/stores/dashboardStore';

	const cards = [
		{ key: 'draftQuotes', label: 'Draft Quotes', href: resolve('/canvas/o2c/quotes/drafts') },
		{ key: 'approvedPos', label: 'Approved POs', href: resolve('/canvas/p2p/purchase-orders/approved') },
		{ key: 'pendingJournals', label: 'Pending Journals', href: resolve('/canvas/r2r/journals/pending') },
		{ key: 'activeEmployees', label: 'Active Employees', href: resolve('/canvas/h2r/employees/active') }
	] as const;

	let loadingSummary = false;

	onMount(() => {
		const unsubscribeActor = actorStore.subscribe(() => {
			void loadSummary();
		});

		void loadSummary();

		return () => {
			unsubscribeActor();
		};
	});

	async function loadSummary(): Promise<void> {
		loadingSummary = true;
		try {
			const summary = await getDashboardSummary($actorStore);
			dashboardStore.set(summary);
		} finally {
			loadingSummary = false;
		}
	}
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
			<Card title={card.label} value={$dashboardStore[card.key]} href={card.href} />
		{/each}
	</div>

	{#if loadingSummary}
		<p class="muted mt-3 text-xs">Refreshing live dashboard counts...</p>
	{/if}

	<div class="mt-8 flex flex-wrap gap-3">
		<a class="rounded-md bg-white px-4 py-2 font-semibold text-slate-900" href={resolve('/canvas')}>
			Open Canvas
		</a>
		<a class="rounded-md border border-white/35 px-4 py-2 text-white" href={resolve('/canvas/create')}>
			Create New Entity
		</a>
	</div>
</div>
