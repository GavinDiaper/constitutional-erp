<script lang="ts">
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import { queryTable } from '$lib/api/query';
	import { actorStore } from '$lib/stores/actorStore';

	type ErpMappingRow = {
		mapping_id: string;
		domain: string;
		entity_name: string;
		canonical_field: string;
		oracle_field: string | null;
		sap_field: string | null;
		dynamics_field: string | null;
		created_at: string;
		updated_at: string;
	};

	type SortKey =
		| 'mapping_id'
		| 'domain'
		| 'entity_name'
		| 'canonical_field'
		| 'oracle_field'
		| 'sap_field'
		| 'dynamics_field'
		| 'updated_at';

	type SortDirection = 'asc' | 'desc';

	let loading = false;
	let errorMessage = '';
	let rows: ErpMappingRow[] = [];
	let searchQuery = '';
	let domainFilter = '';
	let entityFilter = '';
	let sortKey: SortKey = 'domain';
	let sortDirection: SortDirection = 'asc';

	onMount(() => {
		const unsubscribeActor = actorStore.subscribe(() => {
			void loadMappings();
		});

		return () => {
			unsubscribeActor();
		};
	});

	async function loadMappings(): Promise<void> {
		loading = true;
		errorMessage = '';

		try {
			const response = await queryTable<ErpMappingRow>('erp_mapping', $actorStore, 1000, 0);
			rows = response.data ?? [];
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Unable to load ERP mappings.';
			rows = [];
		} finally {
			loading = false;
		}
	}

	function normalize(value: string | null | undefined): string {
		return (value ?? '').trim().toLowerCase();
	}

	function compareValues(a: string | null | undefined, b: string | null | undefined): number {
		const normalizedA = normalize(a);
		const normalizedB = normalize(b);

		if (normalizedA < normalizedB) {
			return -1;
		}
		if (normalizedA > normalizedB) {
			return 1;
		}
		return 0;
	}

	function toggleSort(column: SortKey): void {
		if (sortKey === column) {
			sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
			return;
		}

		sortKey = column;
		sortDirection = 'asc';
	}

	function sortIndicator(column: SortKey): string {
		if (sortKey !== column) {
			return '↕';
		}
		return sortDirection === 'asc' ? '↑' : '↓';
	}

	function displayValue(value: string | null | undefined): string {
		const source = (value ?? '').trim();
		return source.length > 0 ? source : 'n/a';
	}

	$: domainOptions = Array.from(new Set(rows.map((row) => row.domain).filter((value) => value.trim().length > 0))).sort((a, b) =>
		a.localeCompare(b)
	);
	$: entityOptions = Array.from(new Set(rows.map((row) => row.entity_name).filter((value) => value.trim().length > 0))).sort((a, b) =>
		a.localeCompare(b)
	);

	$: filteredRows = rows.filter((row) => {
		const query = normalize(searchQuery);
		const matchesSearch =
			query.length === 0 ||
			normalize(row.mapping_id).includes(query) ||
			normalize(row.domain).includes(query) ||
			normalize(row.entity_name).includes(query) ||
			normalize(row.canonical_field).includes(query) ||
			normalize(row.oracle_field).includes(query) ||
			normalize(row.sap_field).includes(query) ||
			normalize(row.dynamics_field).includes(query);

		const matchesDomain = domainFilter === '' || row.domain === domainFilter;
		const matchesEntity = entityFilter === '' || row.entity_name === entityFilter;

		return matchesSearch && matchesDomain && matchesEntity;
	});

	$: sortedRows = [...filteredRows].sort((left, right) => {
		const comparison = compareValues(left[sortKey], right[sortKey]);
		return sortDirection === 'asc' ? comparison : -comparison;
	});
</script>

<section class="space-y-4">
	<div>
		<h2 class="text-2xl font-semibold">ERP Mappings</h2>
		<p class="muted mt-2 text-sm">Live view of <span class="font-semibold">erp_mapping</span>, aligned with FoundationERP - Mappings to Common ERP.</p>
	</div>

	<div class="flex flex-wrap items-center gap-2">
		<button
			type="button"
			class="rounded-md border dark:border-white/35 border-slate-300 px-3 py-2 text-xs dark:text-white text-slate-900 dark:hover:bg-white/10 hover:bg-slate-500/10"
			on:click={loadMappings}
			disabled={loading}
		>
			{loading ? 'Refreshing...' : 'Refresh'}
		</button>
		<span class="muted text-xs">Rows loaded: {rows.length} | Rows shown: {sortedRows.length}</span>
	</div>

	<div class="grid gap-2 md:grid-cols-3">
		<input
			class="rounded-md border dark:border-white/25 border-slate-300 bg-(--input-bg) px-3 py-2 text-sm"
			placeholder="Search mapping id, domain, entity, canonical or ERP fields"
			bind:value={searchQuery}
		/>
		<select class="rounded-md border dark:border-white/25 border-slate-300 bg-(--input-bg) px-3 py-2 text-sm" bind:value={domainFilter}>
			<option value="">All domains</option>
			{#each domainOptions as domain (domain)}
				<option value={domain}>{domain}</option>
			{/each}
		</select>
		<select class="rounded-md border dark:border-white/25 border-slate-300 bg-(--input-bg) px-3 py-2 text-sm" bind:value={entityFilter}>
			<option value="">All entities</option>
			{#each entityOptions as entity (entity)}
				<option value={entity}>{entity}</option>
			{/each}
		</select>
	</div>

	{#if errorMessage}
		<p class="rounded-md border border-red-500/55 bg-red-500/10 p-3 text-sm text-red-200">{errorMessage}</p>
	{:else if loading}
		<p class="rounded-md border dark:border-white/15 border-slate-300 p-3 text-sm dark:text-white/85 text-slate-700">Loading ERP mappings...</p>
	{:else if sortedRows.length === 0}
		<p class="rounded-md border dark:border-white/15 border-slate-300 p-3 text-sm dark:text-white/85 text-slate-700">No mappings match the current filters.</p>
	{:else}
		<div class="overflow-x-auto rounded-md border dark:border-white/15 border-slate-300">
			<table class="min-w-full text-left text-sm">
				<thead>
					<tr class="border-b dark:border-white/15 border-slate-300 text-xs uppercase tracking-[0.12em] dark:text-white/70 text-slate-600">
						<th class="px-3 py-2">
							<button type="button" class="inline-flex items-center gap-1 dark:hover:text-white hover:text-slate-900" on:click={() => toggleSort('mapping_id')}>
								Mapping ID <span aria-hidden="true">{sortIndicator('mapping_id')}</span>
							</button>
						</th>
						<th class="px-3 py-2">
							<button type="button" class="inline-flex items-center gap-1 dark:hover:text-white hover:text-slate-900" on:click={() => toggleSort('domain')}>
								Domain <span aria-hidden="true">{sortIndicator('domain')}</span>
							</button>
						</th>
						<th class="px-3 py-2">
							<button type="button" class="inline-flex items-center gap-1 dark:hover:text-white hover:text-slate-900" on:click={() => toggleSort('entity_name')}>
								Entity <span aria-hidden="true">{sortIndicator('entity_name')}</span>
							</button>
						</th>
						<th class="px-3 py-2">
							<button type="button" class="inline-flex items-center gap-1 dark:hover:text-white hover:text-slate-900" on:click={() => toggleSort('canonical_field')}>
								Canonical Field <span aria-hidden="true">{sortIndicator('canonical_field')}</span>
							</button>
						</th>
						<th class="px-3 py-2">
							<button type="button" class="inline-flex items-center gap-1 dark:hover:text-white hover:text-slate-900" on:click={() => toggleSort('oracle_field')}>
								Oracle <span aria-hidden="true">{sortIndicator('oracle_field')}</span>
							</button>
						</th>
						<th class="px-3 py-2">
							<button type="button" class="inline-flex items-center gap-1 dark:hover:text-white hover:text-slate-900" on:click={() => toggleSort('sap_field')}>
								SAP <span aria-hidden="true">{sortIndicator('sap_field')}</span>
							</button>
						</th>
						<th class="px-3 py-2">
							<button type="button" class="inline-flex items-center gap-1 dark:hover:text-white hover:text-slate-900" on:click={() => toggleSort('dynamics_field')}>
								Dynamics <span aria-hidden="true">{sortIndicator('dynamics_field')}</span>
							</button>
						</th>
						<th class="px-3 py-2">
							<button type="button" class="inline-flex items-center gap-1 dark:hover:text-white hover:text-slate-900" on:click={() => toggleSort('updated_at')}>
								Updated At <span aria-hidden="true">{sortIndicator('updated_at')}</span>
							</button>
						</th>
					</tr>
				</thead>
				<tbody>
					{#each sortedRows as row (row.mapping_id)}
						<tr class="border-b dark:border-white/10 border-slate-200 align-top">
							<td class="px-3 py-2 font-mono text-xs">{row.mapping_id}</td>
							<td class="px-3 py-2">{row.domain}</td>
							<td class="px-3 py-2">{row.entity_name}</td>
							<td class="px-3 py-2 font-mono text-xs">{row.canonical_field}</td>
							<td class="px-3 py-2 font-mono text-xs">{displayValue(row.oracle_field)}</td>
							<td class="px-3 py-2 font-mono text-xs">{displayValue(row.sap_field)}</td>
							<td class="px-3 py-2 font-mono text-xs">{displayValue(row.dynamics_field)}</td>
							<td class="px-3 py-2 text-xs">{displayValue(row.updated_at)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}

	<div class="flex flex-wrap gap-2">
		<a class="rounded-md border dark:border-white/35 border-slate-300 px-3 py-2 text-xs dark:text-white text-slate-900 dark:hover:bg-white/10 hover:bg-slate-500/10" href={resolve('/admin')}>
			Back to Admin
		</a>
	</div>
</section>
