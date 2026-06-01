<script lang="ts">
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import { queryTable } from '$lib/api/query';
	import { actorStore } from '$lib/stores/actorStore';
	import Tabs from '$lib/components/shared/Tabs.svelte';

	// ─── Types ───────────────────────────────────────────────────────────────────

	type ErpSystem = {
		system_id: string;
		name: string;
		vendor: string;
		generation: string;
		category: string;
		erp_version: string | null;
		notes: string | null;
	};

	type GapReportRow = {
		domain: string;
		system_id: string;
		system_name: string;
		vendor: string;
		total_fields: number;
		mapped: number;
		partial: number;
		not_applicable: number;
		gap: number;
		coverage_pct: number | null;
	};

	type CompareRow = {
		field_id: string;
		domain: string;
		entity_name: string;
		canonical_field: string;
		field_type: string;
		is_key: number;
		fusion_field: string | null;
		fusion_status: string | null;
		ebs_field: string | null;
		ebs_status: string | null;
		sap_s4_field: string | null;
		sap_s4_status: string | null;
		sap_ecc_field: string | null;
		sap_ecc_status: string | null;
		workday_field: string | null;
		workday_status: string | null;
		d365fo_field: string | null;
		d365fo_status: string | null;
		netsuite_field: string | null;
		netsuite_status: string | null;
		odoo_field: string | null;
		odoo_status: string | null;
	};

	type ProcessCoverageRow = {
		process_id: string;
		domain: string;
		process_name: string;
		canonical_command: string | null;
		sequence_order: number;
		system_id: string;
		system_name: string;
		vendor: string;
		mapping_status: string;
		erp_process_name: string | null;
		erp_transaction_code: string | null;
		erp_module: string | null;
		notes: string | null;
	};

	type SystemFieldRow = {
		system_id: string;
		system_name: string;
		vendor: string;
		domain: string;
		entity_context: string;
		erp_module: string | null;
		erp_full_reference: string;
		purpose: string;
		notes: string | null;
	};

	// ─── State ───────────────────────────────────────────────────────────────────

	const TABS = ['Systems', 'Compare Fields', 'Gap Report', 'Processes', 'System Fields'] as const;
	type TabName = (typeof TABS)[number];

	let activeTab: TabName = 'Gap Report';

	let systemsRows: ErpSystem[] = [];
	let gapRows: GapReportRow[] = [];
	let compareRows: CompareRow[] = [];
	let processRows: ProcessCoverageRow[] = [];
	let systemFieldRows: SystemFieldRow[] = [];

	let loadingMap: Record<TabName, boolean> = {
		Systems: false,
		'Compare Fields': false,
		'Gap Report': false,
		Processes: false,
		'System Fields': false
	};
	let errorMap: Record<TabName, string> = {
		Systems: '',
		'Compare Fields': '',
		'Gap Report': '',
		Processes: '',
		'System Fields': ''
	};
	let loadedMap: Record<TabName, boolean> = {
		Systems: false,
		'Compare Fields': false,
		'Gap Report': false,
		Processes: false,
		'System Fields': false
	};

	let compareDomain = '';
	let compareEntity = '';
	let compareSearch = '';
	let processDomain = '';
	let processSystem = '';
	let systemFieldSystem = '';
	let gapSystem = '';

	// ─── Data loading ─────────────────────────────────────────────────────────

	async function loadTab(tab: TabName): Promise<void> {
		if (loadedMap[tab]) return;
		loadingMap = { ...loadingMap, [tab]: true };
		errorMap = { ...errorMap, [tab]: '' };
		try {
			if (tab === 'Systems') {
				const r = await queryTable<ErpSystem>('erp_system', $actorStore, 500, 0);
				systemsRows = r.data ?? [];
			} else if (tab === 'Gap Report') {
				const r = await queryTable<GapReportRow>('v_system_gap_report', $actorStore, 500, 0);
				gapRows = r.data ?? [];
			} else if (tab === 'Compare Fields') {
				const r = await queryTable<CompareRow>('v_cross_system_field_compare', $actorStore, 500, 0);
				compareRows = r.data ?? [];
			} else if (tab === 'Processes') {
				const r = await queryTable<ProcessCoverageRow>('v_process_coverage', $actorStore, 500, 0);
				processRows = r.data ?? [];
			} else if (tab === 'System Fields') {
				const r = await queryTable<SystemFieldRow>('v_system_specific_fields', $actorStore, 500, 0);
				systemFieldRows = r.data ?? [];
			}
			loadedMap = { ...loadedMap, [tab]: true };
		} catch (e) {
			errorMap = { ...errorMap, [tab]: e instanceof Error ? e.message : 'Failed to load data.' };
		} finally {
			loadingMap = { ...loadingMap, [tab]: false };
		}
	}

	async function refreshTab(tab: TabName): Promise<void> {
		loadedMap = { ...loadedMap, [tab]: false };
		await loadTab(tab);
	}

	function switchTab(tab: string): void {
		activeTab = tab as TabName;
		void loadTab(activeTab);
	}

	onMount(() => {
		const unsub = actorStore.subscribe(() => void loadTab(activeTab));
		return unsub;
	});

	// ─── Helpers ─────────────────────────────────────────────────────────────────

	function norm(v: string | null | undefined): string {
		return (v ?? '').trim().toLowerCase();
	}

	function coverageClass(pct: number | null): string {
		if (pct === null) return 'dark:text-white/40 text-slate-400';
		if (pct >= 80) return 'text-emerald-500 font-semibold';
		if (pct >= 40) return 'text-amber-400 font-semibold';
		return 'text-rose-400 font-semibold';
	}

	function statusDot(status: string | null): string {
		if (!status || status === 'GAP') return '·';
		if (status === 'MAPPED') return '✓';
		if (status === 'PARTIAL') return '~';
		if (status === 'NOT_APPLICABLE') return '—';
		return '?';
	}

	function statusCellClass(status: string | null): string {
		if (!status || status === 'GAP') return 'dark:text-white/20 text-slate-300';
		if (status === 'MAPPED') return 'text-emerald-500';
		if (status === 'PARTIAL') return 'text-amber-400';
		if (status === 'NOT_APPLICABLE') return 'dark:text-white/40 text-slate-400';
		return '';
	}

	function categoryBadgeClass(cat: string): string {
		if (cat === 'Tier1') return 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30';
		if (cat === 'Tier2') return 'bg-sky-500/20 text-sky-300 border border-sky-500/30';
		if (cat === 'OpenSource') return 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
		return 'dark:bg-white/10 bg-slate-200';
	}

	function genBadgeClass(gen: string): string {
		if (gen === 'Cloud') return 'bg-purple-500/20 text-purple-300 border border-purple-500/30';
		if (gen === 'On-Premise') return 'bg-orange-500/20 text-orange-300 border border-orange-500/30';
		return 'bg-teal-500/20 text-teal-300 border border-teal-500/30';
	}

	// ─── Derived / filtered ───────────────────────────────────────────────────

	$: compareDomains = [...new Set(compareRows.map((r) => r.domain))].sort();
	$: compareEntities = [...new Set(compareRows.filter((r) => !compareDomain || r.domain === compareDomain).map((r) => r.entity_name))].sort();
	$: filteredCompare = compareRows.filter((r) => {
		const q = norm(compareSearch);
		return (
			(!compareDomain || r.domain === compareDomain) &&
			(!compareEntity || r.entity_name === compareEntity) &&
			(!q ||
				norm(r.canonical_field).includes(q) ||
				norm(r.entity_name).includes(q) ||
				norm(r.fusion_field).includes(q) ||
				norm(r.sap_s4_field).includes(q) ||
				norm(r.d365fo_field).includes(q))
		);
	});

	$: processDomains = [...new Set(processRows.map((r) => r.domain))].sort();
	$: processSystems = [...new Set(processRows.map((r) => r.system_id))].sort();
	type ProcessPivotRow = {
		process_id: string;
		domain: string;
		process_name: string;
		canonical_command: string | null;
		sequence_order: number;
		systems: Record<string, { status: string; erp_process_name: string | null; erp_transaction_code: string | null; erp_module: string | null; notes: string | null }>;
	};
	$: processSystemIds = [...new Set(processRows.map((r) => r.system_id))].sort();
	$: processPivoted = (() => {
		const map = new Map<string, ProcessPivotRow>();
		for (const r of processRows) {
			if (!map.has(r.process_id)) {
				map.set(r.process_id, {
					process_id: r.process_id,
					domain: r.domain,
					process_name: r.process_name,
					canonical_command: r.canonical_command,
					sequence_order: r.sequence_order,
					systems: {}
				});
			}
			map.get(r.process_id)!.systems[r.system_id] = {
				status: r.mapping_status,
				erp_process_name: r.erp_process_name,
				erp_transaction_code: r.erp_transaction_code,
				erp_module: r.erp_module,
				notes: r.notes
			};
		}
		return [...map.values()].sort((a, b) => a.domain.localeCompare(b.domain) || a.sequence_order - b.sequence_order);
	})();
	$: filteredProcess = processPivoted.filter((r) => {
		const domainOk = !processDomain || r.domain === processDomain;
		const sysOk = !processSystem || r.systems[processSystem] !== undefined;
		return domainOk && sysOk;
	});
	$: processVisibleSystems = processSystem ? [processSystem] : processSystemIds;

	$: gapSystems = [...new Set(gapRows.map((r) => r.system_id))].sort();
	$: filteredGap = gapRows.filter((r) => !gapSystem || r.system_id === gapSystem);

	$: sfSystems = [...new Set(systemFieldRows.map((r) => r.system_id))].sort();
	$: filteredSystemFields = systemFieldRows.filter((r) => !systemFieldSystem || r.system_id === systemFieldSystem);
</script>

<section class="space-y-4">
	<div>
		<h2 class="text-2xl font-semibold">ERP Mappings</h2>
		<p class="muted mt-2 text-sm">
			Multi-system canonical field and process coverage explorer.
			<a class="underline opacity-60 hover:opacity-100" href={resolve('/admin/erp-mappings-v0')}>Legacy V0 view</a>
		</p>
	</div>

	<Tabs tabs={[...TABS]} selected={activeTab} onSelect={switchTab} />

	<!-- ─── Systems tab ─────────────────────────────────────────────────────── -->
	{#if activeTab === 'Systems'}
		<div class="flex items-center gap-2">
			<button type="button" class="rounded-md border dark:border-white/35 border-slate-300 px-3 py-2 text-xs dark:hover:bg-white/10 hover:bg-slate-500/10" on:click={() => refreshTab('Systems')} disabled={loadingMap['Systems']}>
				{loadingMap['Systems'] ? 'Refreshing...' : 'Refresh'}
			</button>
			<span class="muted text-xs">{systemsRows.length} systems</span>
		</div>

		{#if errorMap['Systems']}
			<p class="rounded-md border border-red-500/55 bg-red-500/10 p-3 text-sm text-red-400">{errorMap['Systems']}</p>
		{:else if loadingMap['Systems']}
			<p class="muted text-sm p-3">Loading…</p>
		{:else}
			<div class="overflow-x-auto rounded-md border dark:border-white/15 border-slate-300">
				<table class="min-w-full text-left text-sm">
					<thead>
						<tr class="border-b dark:border-white/15 border-slate-300 text-xs uppercase tracking-[0.12em] dark:text-white/60 text-slate-500">
							<th class="px-3 py-2">System ID</th>
							<th class="px-3 py-2">Name</th>
							<th class="px-3 py-2">Vendor</th>
							<th class="px-3 py-2">Generation</th>
							<th class="px-3 py-2">Category</th>
							<th class="px-3 py-2">Version</th>
							<th class="px-3 py-2">Notes</th>
						</tr>
					</thead>
					<tbody>
						{#each systemsRows as s (s.system_id)}
							<tr class="border-b dark:border-white/10 border-slate-200 align-top">
								<td class="px-3 py-2 font-mono text-xs font-semibold">{s.system_id}</td>
								<td class="px-3 py-2 font-medium">{s.name}</td>
								<td class="px-3 py-2 text-xs">{s.vendor}</td>
								<td class="px-3 py-2">
									<span class="rounded px-1.5 py-0.5 text-xs {genBadgeClass(s.generation)}">{s.generation}</span>
								</td>
								<td class="px-3 py-2">
									<span class="rounded px-1.5 py-0.5 text-xs {categoryBadgeClass(s.category)}">{s.category}</span>
								</td>
								<td class="px-3 py-2 font-mono text-xs dark:text-white/70 text-slate-600">{s.erp_version ?? '—'}</td>
								<td class="px-3 py-2 text-xs dark:text-white/60 text-slate-500 max-w-xs">{s.notes ?? '—'}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	{/if}

	<!-- ─── Gap Report tab ────────────────────────────────────────────────────── -->
	{#if activeTab === 'Gap Report'}
		<div class="flex flex-wrap items-center gap-2">
			<button type="button" class="rounded-md border dark:border-white/35 border-slate-300 px-3 py-2 text-xs dark:hover:bg-white/10 hover:bg-slate-500/10" on:click={() => refreshTab('Gap Report')} disabled={loadingMap['Gap Report']}>
				{loadingMap['Gap Report'] ? 'Refreshing...' : 'Refresh'}
			</button>
			<select class="rounded-md border dark:border-white/25 border-slate-300 bg-(--input-bg) px-3 py-2 text-xs" bind:value={gapSystem}>
				<option value="">All systems</option>
				{#each gapSystems as sid (sid)}
					<option value={sid}>{sid}</option>
				{/each}
			</select>
			<span class="muted text-xs">{filteredGap.length} rows</span>
		</div>

		{#if errorMap['Gap Report']}
			<p class="rounded-md border border-red-500/55 bg-red-500/10 p-3 text-sm text-red-400">{errorMap['Gap Report']}</p>
		{:else if loadingMap['Gap Report']}
			<p class="muted text-sm p-3">Loading…</p>
		{:else}
			<div class="overflow-x-auto rounded-md border dark:border-white/15 border-slate-300">
				<table class="min-w-full text-left text-sm">
					<thead>
						<tr class="border-b dark:border-white/15 border-slate-300 text-xs uppercase tracking-[0.12em] dark:text-white/60 text-slate-500">
							<th class="px-3 py-2">Domain</th>
							<th class="px-3 py-2">System</th>
							<th class="px-3 py-2">Vendor</th>
							<th class="px-3 py-2 text-right">Total</th>
							<th class="px-3 py-2 text-right">Mapped</th>
							<th class="px-3 py-2 text-right">Partial</th>
							<th class="px-3 py-2 text-right">Gap</th>
							<th class="px-3 py-2 text-right">Coverage</th>
							<th class="px-3 py-2">Bar</th>
						</tr>
					</thead>
					<tbody>
						{#each filteredGap as r (`${r.domain}-${r.system_id}`)}
							<tr class="border-b dark:border-white/10 border-slate-200 align-middle">
								<td class="px-3 py-2 font-semibold text-xs">{r.domain}</td>
								<td class="px-3 py-2 font-mono text-xs">{r.system_id}</td>
								<td class="px-3 py-2 text-xs dark:text-white/60 text-slate-500">{r.vendor}</td>
								<td class="px-3 py-2 text-right tabular-nums text-xs">{r.total_fields}</td>
								<td class="px-3 py-2 text-right tabular-nums text-xs text-emerald-500">{r.mapped}</td>
								<td class="px-3 py-2 text-right tabular-nums text-xs text-amber-400">{r.partial}</td>
								<td class="px-3 py-2 text-right tabular-nums text-xs text-rose-400">{r.gap}</td>
								<td class="px-3 py-2 text-right tabular-nums text-xs {coverageClass(r.coverage_pct)}">
									{r.coverage_pct !== null ? r.coverage_pct + '%' : '—'}
								</td>
								<td class="px-3 py-2">
									<div class="h-2 w-24 rounded-full dark:bg-white/10 bg-slate-200 overflow-hidden">
										<div
											class="h-full rounded-full {(r.coverage_pct ?? 0) >= 80 ? 'bg-emerald-500' : (r.coverage_pct ?? 0) >= 40 ? 'bg-amber-400' : 'bg-rose-400'}"
											style="width: {r.coverage_pct ?? 0}%"
										></div>
									</div>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	{/if}

	<!-- ─── Compare Fields tab ────────────────────────────────────────────────── -->
	{#if activeTab === 'Compare Fields'}
		<div class="flex flex-wrap items-center gap-2">
			<button type="button" class="rounded-md border dark:border-white/35 border-slate-300 px-3 py-2 text-xs dark:hover:bg-white/10 hover:bg-slate-500/10" on:click={() => refreshTab('Compare Fields')} disabled={loadingMap['Compare Fields']}>
				{loadingMap['Compare Fields'] ? 'Refreshing...' : 'Refresh'}
			</button>
			<select class="rounded-md border dark:border-white/25 border-slate-300 bg-(--input-bg) px-3 py-2 text-xs" bind:value={compareDomain} on:change={() => { compareEntity = ''; }}>
				<option value="">All domains</option>
				{#each compareDomains as d (d)}<option value={d}>{d}</option>{/each}
			</select>
			<select class="rounded-md border dark:border-white/25 border-slate-300 bg-(--input-bg) px-3 py-2 text-xs" bind:value={compareEntity}>
				<option value="">All entities</option>
				{#each compareEntities as e (e)}<option value={e}>{e}</option>{/each}
			</select>
			<input
				class="rounded-md border dark:border-white/25 border-slate-300 bg-(--input-bg) px-3 py-2 text-xs w-52"
				placeholder="Search field or reference…"
				bind:value={compareSearch}
			/>
			<span class="muted text-xs">{filteredCompare.length} fields</span>
		</div>

		<p class="muted text-xs">
			<span class="text-emerald-500 font-semibold">✓ MAPPED</span> &nbsp;
			<span class="text-amber-400 font-semibold">~ PARTIAL</span> &nbsp;
			<span class="dark:text-white/40 text-slate-400">— N/A</span> &nbsp;
			<span class="dark:text-white/20 text-slate-300">· GAP</span>
		</p>

		{#if errorMap['Compare Fields']}
			<p class="rounded-md border border-red-500/55 bg-red-500/10 p-3 text-sm text-red-400">{errorMap['Compare Fields']}</p>
		{:else if loadingMap['Compare Fields']}
			<p class="muted text-sm p-3">Loading…</p>
		{:else}
			<div class="overflow-x-auto rounded-md border dark:border-white/15 border-slate-300">
				<table class="min-w-full text-left text-xs">
					<thead>
						<tr class="border-b dark:border-white/15 border-slate-300 text-xs uppercase tracking-[0.12em] dark:text-white/60 text-slate-500">
							<th class="px-3 py-2">Domain</th>
							<th class="px-3 py-2">Entity</th>
							<th class="px-3 py-2">Canonical Field</th>
							<th class="px-3 py-2">Type</th>
							<th class="px-2 py-2 text-center">Key</th>
							<th class="px-3 py-2 border-l dark:border-white/10 border-slate-200">Fusion</th>
							<th class="px-3 py-2">EBS</th>
							<th class="px-3 py-2">SAP S/4</th>
							<th class="px-3 py-2">SAP ECC</th>
							<th class="px-3 py-2">Workday</th>
							<th class="px-3 py-2">D365 F&O</th>
							<th class="px-3 py-2">NetSuite</th>
							<th class="px-3 py-2">Odoo</th>
						</tr>
					</thead>
					<tbody>
						{#each filteredCompare as r (r.field_id)}
							<tr class="border-b dark:border-white/10 border-slate-200 align-top hover:dark:bg-white/5 hover:bg-slate-50">
								<td class="px-3 py-1.5 font-semibold">{r.domain}</td>
								<td class="px-3 py-1.5">{r.entity_name}</td>
								<td class="px-3 py-1.5 font-mono font-semibold">{r.canonical_field}</td>
								<td class="px-3 py-1.5 dark:text-white/50 text-slate-400">{r.field_type}</td>
								<td class="px-2 py-1.5 text-center">{r.is_key ? '🔑' : ''}</td>
								<td class="px-3 py-1.5 border-l dark:border-white/10 border-slate-200 {statusCellClass(r.fusion_status)}">
									{#if r.fusion_field}<span class="font-mono">{r.fusion_field}</span>{:else}<span class="select-none">{statusDot(r.fusion_status)}</span>{/if}
								</td>
								<td class="px-3 py-1.5 {statusCellClass(r.ebs_status)}">
									{#if r.ebs_field}<span class="font-mono">{r.ebs_field}</span>{:else}<span class="select-none">{statusDot(r.ebs_status)}</span>{/if}
								</td>
								<td class="px-3 py-1.5 {statusCellClass(r.sap_s4_status)}">
									{#if r.sap_s4_field}<span class="font-mono">{r.sap_s4_field}</span>{:else}<span class="select-none">{statusDot(r.sap_s4_status)}</span>{/if}
								</td>
								<td class="px-3 py-1.5 {statusCellClass(r.sap_ecc_status)}">
									{#if r.sap_ecc_field}<span class="font-mono">{r.sap_ecc_field}</span>{:else}<span class="select-none">{statusDot(r.sap_ecc_status)}</span>{/if}
								</td>
								<td class="px-3 py-1.5 {statusCellClass(r.workday_status)}">
									{#if r.workday_field}<span class="font-mono">{r.workday_field}</span>{:else}<span class="select-none">{statusDot(r.workday_status)}</span>{/if}
								</td>
								<td class="px-3 py-1.5 {statusCellClass(r.d365fo_status)}">
									{#if r.d365fo_field}<span class="font-mono">{r.d365fo_field}</span>{:else}<span class="select-none">{statusDot(r.d365fo_status)}</span>{/if}
								</td>
								<td class="px-3 py-1.5 {statusCellClass(r.netsuite_status)}">
									{#if r.netsuite_field}<span class="font-mono">{r.netsuite_field}</span>{:else}<span class="select-none">{statusDot(r.netsuite_status)}</span>{/if}
								</td>
								<td class="px-3 py-1.5 {statusCellClass(r.odoo_status)}">
									{#if r.odoo_field}<span class="font-mono">{r.odoo_field}</span>{:else}<span class="select-none">{statusDot(r.odoo_status)}</span>{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	{/if}

	<!-- ─── Processes tab ─────────────────────────────────────────────────────── -->
	{#if activeTab === 'Processes'}
		<div class="flex flex-wrap items-center gap-2">
			<button type="button" class="rounded-md border dark:border-white/35 border-slate-300 px-3 py-2 text-xs dark:hover:bg-white/10 hover:bg-slate-500/10" on:click={() => refreshTab('Processes')} disabled={loadingMap['Processes']}>
				{loadingMap['Processes'] ? 'Refreshing...' : 'Refresh'}
			</button>
			<select class="rounded-md border dark:border-white/25 border-slate-300 bg-(--input-bg) px-3 py-2 text-xs" bind:value={processDomain}>
				<option value="">All domains</option>
				{#each processDomains as d (d)}<option value={d}>{d}</option>{/each}
			</select>
			<select class="rounded-md border dark:border-white/25 border-slate-300 bg-(--input-bg) px-3 py-2 text-xs" bind:value={processSystem}>
				<option value="">All systems</option>
				{#each processSystems as sid (sid)}<option value={sid}>{sid}</option>{/each}
			</select>
			<span class="muted text-xs">{filteredProcess.length} processes</span>
		</div>

		{#if errorMap['Processes']}
			<p class="rounded-md border border-red-500/55 bg-red-500/10 p-3 text-sm text-red-400">{errorMap['Processes']}</p>
		{:else if loadingMap['Processes']}
			<p class="muted text-sm p-3">Loading…</p>
		{:else}
			<div class="overflow-x-auto rounded-md border dark:border-white/15 border-slate-300">
				<table class="min-w-full text-left text-xs">
					<thead>
						<tr class="border-b dark:border-white/15 border-slate-300 text-xs uppercase tracking-[0.12em] dark:text-white/60 text-slate-500">
							<th class="px-3 py-2">Domain</th>
							<th class="px-3 py-2">Process</th>
							<th class="px-3 py-2">Command</th>
							{#each processVisibleSystems as sid (sid)}
								<th class="px-3 py-2 border-l dark:border-white/10 border-slate-200">{sid}</th>
							{/each}
						</tr>
					</thead>
					<tbody>
						{#each filteredProcess as row (row.process_id)}
							<tr class="border-b dark:border-white/10 border-slate-200 align-top hover:dark:bg-white/5 hover:bg-slate-50">
								<td class="px-3 py-2 font-semibold">{row.domain}</td>
								<td class="px-3 py-2 font-medium max-w-[180px]">{row.process_name}</td>
								<td class="px-3 py-2 font-mono dark:text-white/50 text-slate-400">{row.canonical_command ?? '—'}</td>
								{#each processVisibleSystems as sid (sid)}
									{@const sys = row.systems[sid]}
									<td class="px-3 py-2 border-l dark:border-white/10 border-slate-200 {statusCellClass(sys?.status ?? null)} max-w-[200px]">
										{#if sys && sys.status !== 'GAP'}
											<div class="space-y-0.5">
												{#if sys.erp_process_name}<div class="font-medium dark:text-white text-slate-800">{sys.erp_process_name}</div>{/if}
												{#if sys.erp_transaction_code}<div class="font-mono text-xs dark:text-white/70 text-slate-600">{sys.erp_transaction_code}</div>{/if}
												{#if sys.erp_module}<div class="dark:text-white/40 text-slate-400 text-xs">{sys.erp_module}</div>{/if}
											</div>
										{:else}
											<span class="select-none">{statusDot(sys?.status ?? null)}</span>
										{/if}
									</td>
								{/each}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	{/if}

	<!-- ─── System Fields tab ─────────────────────────────────────────────────── -->
	{#if activeTab === 'System Fields'}
		<div class="space-y-1 rounded-md border dark:border-amber-400/30 border-amber-300/60 bg-amber-400/5 p-3">
			<p class="text-xs font-semibold dark:text-amber-300 text-amber-700">ERP-native fields with no canonical equivalent</p>
			<p class="text-xs dark:text-white/60 text-slate-500">These are fields that exist in specific ERP systems but fall outside the canonical data model — e.g. SAP Controlling objects, Workday Worktags, Oracle flexfield segments.</p>
		</div>

		<div class="flex flex-wrap items-center gap-2">
			<button type="button" class="rounded-md border dark:border-white/35 border-slate-300 px-3 py-2 text-xs dark:hover:bg-white/10 hover:bg-slate-500/10" on:click={() => refreshTab('System Fields')} disabled={loadingMap['System Fields']}>
				{loadingMap['System Fields'] ? 'Refreshing...' : 'Refresh'}
			</button>
			<select class="rounded-md border dark:border-white/25 border-slate-300 bg-(--input-bg) px-3 py-2 text-xs" bind:value={systemFieldSystem}>
				<option value="">All systems</option>
				{#each sfSystems as sid (sid)}<option value={sid}>{sid}</option>{/each}
			</select>
			<span class="muted text-xs">{filteredSystemFields.length} fields</span>
		</div>

		{#if errorMap['System Fields']}
			<p class="rounded-md border border-red-500/55 bg-red-500/10 p-3 text-sm text-red-400">{errorMap['System Fields']}</p>
		{:else if loadingMap['System Fields']}
			<p class="muted text-sm p-3">Loading…</p>
		{:else}
			<div class="overflow-x-auto rounded-md border dark:border-white/15 border-slate-300">
				<table class="min-w-full text-left text-xs">
					<thead>
						<tr class="border-b dark:border-white/15 border-slate-300 text-xs uppercase tracking-[0.12em] dark:text-white/60 text-slate-500">
							<th class="px-3 py-2">System</th>
							<th class="px-3 py-2">Domain</th>
							<th class="px-3 py-2">Entity Context</th>
							<th class="px-3 py-2">Module</th>
							<th class="px-3 py-2">ERP Field Reference</th>
							<th class="px-3 py-2">Purpose</th>
							<th class="px-3 py-2">Why No Canonical Equivalent</th>
						</tr>
					</thead>
					<tbody>
						{#each filteredSystemFields as r (r.erp_full_reference + r.system_id)}
							<tr class="border-b dark:border-white/10 border-slate-200 align-top">
								<td class="px-3 py-2 font-mono font-semibold">{r.system_id}</td>
								<td class="px-3 py-2 font-semibold">{r.domain}</td>
								<td class="px-3 py-2">{r.entity_context}</td>
								<td class="px-3 py-2 dark:text-white/60 text-slate-500">{r.erp_module ?? '—'}</td>
								<td class="px-3 py-2 font-mono dark:text-indigo-300 text-indigo-700">{r.erp_full_reference}</td>
								<td class="px-3 py-2 max-w-xs">{r.purpose}</td>
								<td class="px-3 py-2 max-w-sm dark:text-white/60 text-slate-500">{r.notes ?? '—'}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	{/if}

	<div class="flex flex-wrap gap-2 pt-2">
		<a class="rounded-md border dark:border-white/35 border-slate-300 px-3 py-2 text-xs dark:text-white text-slate-900 dark:hover:bg-white/10 hover:bg-slate-500/10" href={resolve('/admin')}>
			Back to Admin
		</a>
		<a class="rounded-md border dark:border-white/35 border-slate-300 px-3 py-2 text-xs dark:text-white text-slate-900 dark:hover:bg-white/10 hover:bg-slate-500/10" href={resolve('/admin/erp-mappings-v0')}>
			ERP Mapping V0 (Legacy)
		</a>
	</div>
</section>
