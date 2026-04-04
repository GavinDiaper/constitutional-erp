<script lang="ts">
	import { resolve } from '$app/paths';
	import MermaidDiagram from '$lib/components/shared/MermaidDiagram.svelte';
	import type { PageData } from './$types';

	export let data: PageData;

	let selectedEntity = '';
	let selectedTable = '';
	let queryBasePath = '';
	let tableRows: Record<string, unknown>[] = [];
	let loadingData = false;
	let dataError = '';
	let showAllRecords = false;
	let sortColumn = '';
	let sortDirection: 'asc' | 'desc' = 'asc';

	const previewLimit = 20;
	const fetchPageSize = 500;

	const subsystemByPrefix: Record<string, string> = {
		AE: 'authority-engine',
		GE: 'governance-engine',
		EP: 'event-processor',
		MG: 'mesh-gateway',
		PGE: 'process-graph',
		NAI: 'navigator-ai'
	};

	$: columnHeaders = tableRows.length > 0 ? Object.keys(tableRows[0]) : [];
	$: sortedRows = [...tableRows].sort((a, b) => compareRowValues(a[sortColumn], b[sortColumn]));

	function resolveQueryBasePath(nodeId: string): { table: string; basePath: string } | null {
		const [prefix, ...rest] = nodeId.split('_');
		const suffix = rest.join('_');

		if (!suffix) return null;

		if (prefix === 'F') {
			return {
				table: suffix,
				basePath: `/api/hub/query/${suffix}`
			};
		}

		const subsystem = subsystemByPrefix[prefix];
		if (!subsystem) return null;

		return {
			table: suffix,
			basePath: `/api/subsystems/${subsystem}/query/${suffix}`
		};
	}

	function compareRowValues(a: unknown, b: unknown): number {
		if (!sortColumn) return 0;
		if (a == null && b == null) return 0;
		if (a == null) return sortDirection === 'asc' ? -1 : 1;
		if (b == null) return sortDirection === 'asc' ? 1 : -1;

		if (typeof a === 'number' && typeof b === 'number') {
			return sortDirection === 'asc' ? a - b : b - a;
		}

		const aText = String(a);
		const bText = String(b);
		const result = aText.localeCompare(bText, undefined, { numeric: true, sensitivity: 'base' });
		return sortDirection === 'asc' ? result : -result;
	}

	function toggleSort(column: string) {
		if (sortColumn === column) {
			sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
			return;
		}

		sortColumn = column;
		sortDirection = 'asc';
	}

	async function fetchRowsOnce(basePath: string, limit: number, offset = 0) {
		const url = `${basePath}?limit=${limit}&offset=${offset}`;
		const res = await fetch(url);
		const json: { data?: Record<string, unknown>[]; error?: { detail?: string }; detail?: string } =
			await res.json().catch(() => ({}));

		if (!res.ok) {
			throw new Error(json?.error?.detail ?? json?.detail ?? `Query failed: ${res.status} ${res.statusText}`);
		}

		return json.data ?? [];
	}

	async function loadRows(basePath: string, includeAll: boolean) {
		if (!includeAll) {
			tableRows = await fetchRowsOnce(basePath, previewLimit, 0);
			return;
		}

		const allRows: Record<string, unknown>[] = [];
		let offset = 0;
		while (true) {
			const page = await fetchRowsOnce(basePath, fetchPageSize, offset);
			allRows.push(...page);
			if (page.length < fetchPageSize) break;
			offset += fetchPageSize;
		}

		tableRows = allRows;
	}

	async function handleNodeClick(nodeId: string) {
		selectedEntity = nodeId;
		sortColumn = '';
		sortDirection = 'asc';
		tableRows = [];
		dataError = '';
		showAllRecords = false;
		selectedTable = '';
		queryBasePath = '';

		const resolved = resolveQueryBasePath(nodeId);
		if (!resolved) {
			dataError = `No data query API mapping available for ${nodeId}.`;
			return;
		}

		selectedTable = resolved.table;
		queryBasePath = resolved.basePath;

		loadingData = true;
		try {
			await loadRows(queryBasePath, false);
		} catch (e) {
			dataError = e instanceof Error ? e.message : 'Network error fetching data.';
		} finally {
			loadingData = false;
		}
	}

	async function toggleShowAll() {
		if (!queryBasePath || loadingData) return;

		showAllRecords = !showAllRecords;
		loadingData = true;
		dataError = '';
		try {
			await loadRows(queryBasePath, showAllRecords);
		} catch (e) {
			dataError = e instanceof Error ? e.message : 'Network error fetching data.';
		} finally {
			loadingData = false;
		}
	}

	function dismissPanel() {
		selectedEntity = '';
		selectedTable = '';
		queryBasePath = '';
		tableRows = [];
		dataError = '';
		showAllRecords = false;
		sortColumn = '';
		sortDirection = 'asc';
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
			{#if selectedTable}
				<p class="mt-1 text-xs text-slate-500">Table: <code>{selectedTable}</code></p>
			{/if}
		</div>
		<div class="flex gap-2">
			<button
				class="rounded border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
				on:click={toggleShowAll}
				disabled={loadingData}
			>
				{showAllRecords ? 'Show Preview (20)' : 'Show All Records'}
			</button>
			<button
				class="rounded border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
				on:click={dismissPanel}
			>
				Dismiss
			</button>
		</div>
	</div>

	{#if loadingData}
		<p class="mt-4 text-sm text-slate-500">Loading rows…</p>
	{:else if dataError}
		<p class="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{dataError}</p>
	{:else if tableRows.length === 0}
		<p class="mt-4 text-sm text-slate-500">No rows found in <code class="text-xs">{selectedTable || selectedEntity.split('_').slice(1).join('_')}</code>.</p>
	{:else}
		<div class="mt-4 overflow-x-auto">
			<table class="w-full text-left text-xs">
				<thead>
					<tr class="border-b border-slate-200">
						{#each columnHeaders as col (col)}
							<th class="pb-2 pr-4 font-semibold text-slate-700 whitespace-nowrap">
								<button class="inline-flex items-center gap-1 hover:text-slate-900" on:click={() => toggleSort(col)}>
									<span>{col}</span>
									{#if sortColumn === col}
										<span>{sortDirection === 'asc' ? '▲' : '▼'}</span>
									{/if}
								</button>
							</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each sortedRows as row, i (i)}
						<tr class="border-b border-slate-100 odd:bg-slate-50/60">
							{#each columnHeaders as col (col)}
								<td class="py-1.5 pr-4 text-slate-800 whitespace-nowrap">{row[col] ?? ''}</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
			<p class="mt-2 text-xs text-slate-400">
				Showing {tableRows.length} row{tableRows.length === 1 ? '' : 's'}
				{showAllRecords ? ' (all records mode)' : ' (preview mode)'}
				· table: <code>{selectedTable || selectedEntity.split('_').slice(1).join('_')}</code>
			</p>
		</div>
	{/if}
</section>
{/if}
