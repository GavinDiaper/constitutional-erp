<script lang="ts">
	import { resolve } from '$app/paths';
	import MermaidDiagram from '$lib/components/shared/MermaidDiagram.svelte';
	import type { PageData } from './$types';

	export let data: PageData;

	let selectedEntity = '';
	let tableRows: Record<string, unknown>[] = [];
	let loadingData = false;
	let dataError = '';

	$: columnHeaders = tableRows.length > 0 ? Object.keys(tableRows[0]) : [];

	async function handleNodeClick(nodeId: string) {
		selectedEntity = nodeId;
		tableRows = [];
		dataError = '';

		if (!nodeId.startsWith('F_')) {
			dataError = `No data query API available for ${nodeId}. Only FoundationERP entities (F_…) are queryable from this UI.`;
			return;
		}

		const tableName = nodeId.slice(2); // strip "F_" prefix → e.g. "o2c_customer"
		loadingData = true;
		try {
			const res = await fetch(`/api/hub/query/${tableName}?limit=20`);
			const json: { data?: Record<string, unknown>[]; error?: { detail?: string }; detail?: string } =
				await res.json().catch(() => ({}));
			if (!res.ok) {
				dataError =
					json?.error?.detail ?? json?.detail ?? `Query failed: ${res.status} ${res.statusText}`;
			} else {
				tableRows = json.data ?? [];
			}
		} catch (e) {
			dataError = e instanceof Error ? e.message : 'Network error fetching data.';
		} finally {
			loadingData = false;
		}
	}

	function dismissPanel() {
		selectedEntity = '';
		tableRows = [];
		dataError = '';
	}
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
	<MermaidDiagram
		title={data.diagram.title}
		definition={data.diagram.definition}
		onNodeClick={handleNodeClick}
	/>
</section>

{#if selectedEntity}
<section class="mt-6 rounded-2xl border border-white/30 bg-white/80 p-6 md:p-8">
	<div class="flex items-start justify-between gap-4">
		<div>
			<p class="text-xs uppercase tracking-widest text-slate-500">Live Data</p>
			<h2 class="mt-1 text-lg font-semibold text-slate-900">{selectedEntity}</h2>
		</div>
		<button
			class="rounded border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
			on:click={dismissPanel}
		>
			Dismiss
		</button>
	</div>

	{#if loadingData}
		<p class="mt-4 text-sm text-slate-500">Loading rows…</p>
	{:else if dataError}
		<p class="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{dataError}</p>
	{:else if tableRows.length === 0}
		<p class="mt-4 text-sm text-slate-500">No rows found in <code class="text-xs">{selectedEntity.slice(2)}</code>.</p>
	{:else}
		<div class="mt-4 overflow-x-auto">
			<table class="w-full text-left text-xs">
				<thead>
					<tr class="border-b border-slate-200">
						{#each columnHeaders as col (col)}
							<th class="pb-2 pr-4 font-semibold text-slate-700 whitespace-nowrap">{col}</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each tableRows as row, i (i)}
						<tr class="border-b border-slate-100 odd:bg-slate-50/60">
							{#each columnHeaders as col (col)}
								<td class="py-1.5 pr-4 text-slate-800 whitespace-nowrap">{row[col] ?? ''}</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
			<p class="mt-2 text-xs text-slate-400">Showing up to 20 rows · table: <code>{selectedEntity.slice(2)}</code></p>
		</div>
	{/if}
</section>
{/if}
