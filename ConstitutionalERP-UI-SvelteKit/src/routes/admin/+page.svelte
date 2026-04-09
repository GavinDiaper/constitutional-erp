<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { fetchAggregateIds } from '$lib/api/aggregates';
	import { getMcpFunctions } from '$lib/api/mcp';
	import EntityActionSankey from '$lib/components/canvas/EntityActionSankey.svelte';
	import { buildEntityActionSankeyModel } from '$lib/flows/sankey';
	import { actorStore } from '$lib/stores/actorStore';
	import type { EntityActionSankeyModel } from '$lib/types/hub';

	let isLoadingSankey = false;
	let sankeyError = '';
	let mcpFunctionCount = 0;
	let sankeyModel: EntityActionSankeyModel = {
		nodes: [],
		links: []
	};

	onMount(() => {
		const unsubscribeActor = actorStore.subscribe(() => {
			void loadSankeyData();
		});

		void loadSankeyData();

		return () => {
			unsubscribeActor();
		};
	});

	async function loadSankeyData(): Promise<void> {
		isLoadingSankey = true;
		sankeyError = '';

		try {
			const actor = $actorStore;
			const result = await getMcpFunctions(actor);
			const functions = result.data ?? [];
			mcpFunctionCount = functions.length;
			const aggregateIds = await fetchAggregateIds(functions, actor);
			sankeyModel = buildEntityActionSankeyModel(functions, aggregateIds);
		} catch (error) {
			sankeyError = error instanceof Error ? error.message : 'Unable to load Sankey source data.';
			sankeyModel = { nodes: [], links: [] };
		} finally {
			isLoadingSankey = false;
		}
	}
</script>

<h2 class="text-2xl font-semibold">Admin Dashboard</h2>
<p class="muted mt-2 text-sm">Admin dashboards and inspectors for governance, events, and accounting drilldowns.</p>

<div class="mt-4 flex flex-wrap gap-2">
	<a class="rounded-md border border-white/35 px-3 py-2 text-xs text-white hover:bg-white/10" href={resolve('/admin/create-entities')}>Open Create Admin Entities</a>
	<a class="rounded-md border border-white/35 px-3 py-2 text-xs text-white hover:bg-white/10" href={resolve('/admin/events')}>Open Event Stream Viewer</a>
	<a class="rounded-md border border-white/35 px-3 py-2 text-xs text-white hover:bg-white/10" href={resolve('/admin/r2r/trial-balance')}>Open R2R Trial Balance</a>
	<a class="rounded-md border border-white/35 px-3 py-2 text-xs text-white hover:bg-white/10" href={resolve('/admin/r2r/ledger-entries')}>Open R2R Ledger Entries</a>
	<a class="rounded-md border border-white/35 px-3 py-2 text-xs text-white hover:bg-white/10" href={resolve('/admin/r2r/tax-summary')}>Open R2R Tax Summary</a>
	<a class="rounded-md border border-white/35 px-3 py-2 text-xs text-white hover:bg-white/10" href={resolve('/admin/r2r/vat-report')}>Open R2R VAT Report</a>
	<a class="rounded-md border border-white/35 px-3 py-2 text-xs text-white hover:bg-white/10" href={resolve('/admin/r2r/withholding-tax')}>Open R2R Withholding Tax</a>
</div>

<div class="mt-6 border-t border-white/10 pt-4">
	<h3 class="mb-3 text-xs uppercase tracking-[0.15em] text-white/70">Navigator</h3>
	<div class="flex flex-wrap gap-2">
		<a class="rounded-md border border-white/35 px-3 py-2 text-xs text-white hover:bg-white/10" href={resolve('/navigator/sessions')}>Open Navigator Sessions</a>
	</div>
</div>

<div class="mt-8 border-t border-white/10 pt-6">
	<h3 class="text-xl font-semibold">System Entity Action Topology</h3>
	<p class="muted mt-2 text-sm">
		D3 Sankey showing domain → aggregate type → live instance ID → action. Create operations link directly from type to action (no instance ID). Each parent splits equally across its outgoing paths.
	</p>

	{#if isLoadingSankey}
		<p class="mt-4 rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm text-white/80">Loading Sankey data...</p>
	{:else if sankeyError}
		<p class="mt-4 rounded-md border border-red-400/40 bg-red-900/20 px-3 py-2 text-sm text-red-100">{sankeyError}</p>
	{:else if sankeyModel.nodes.length === 0}
		<p class="mt-4 rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm text-white/80">No eligible entity actions were returned by MCP catalog.</p>
	{:else}
		<p class="mt-3 text-xs text-white/60">
			Source MCP functions: {mcpFunctionCount} | Sankey nodes: {sankeyModel.nodes.length} | Sankey links: {sankeyModel.links.length}
		</p>
		<div class="mt-4">
			<EntityActionSankey model={sankeyModel} title="Domain → Aggregate Type → Instance ID → Action" />
		</div>
	{/if}
</div>
