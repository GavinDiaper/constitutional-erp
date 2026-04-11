<script lang="ts">
	import { onMount } from 'svelte';
	import { queryTable } from '$lib/api/query';
	import { actorStore } from '$lib/stores/actorStore';

	interface TaxLine {
		tax_transaction_line_id: string;
		source_domain: string;
		source_entity_type: string;
		source_entity_id: string;
		transaction_type: string;
		tax_code_id: string;
		tax_applicability: string;
		taxable_amount: number | string;
		tax_amount: number | string;
		currency_code: string;
		accounting_status: string;
		accounting_journal_id: string | null;
		created_at: string;
	}

	let loading = false;
	let errorMessage = '';
	let allLines: TaxLine[] = [];
	let statusFilter = '';

	onMount(() => {
		const unsub = actorStore.subscribe(() => { void loadData(); });
		void loadData();
		return unsub;
	});

	async function loadData(): Promise<void> {
		loading = true;
		errorMessage = '';
		try {
			const result = await queryTable<TaxLine>('tax_transaction_line', $actorStore, 2000);
			allLines = (result.data ?? []).filter(l => l.tax_applicability === 'withholding');
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Unable to load withholding tax lines.';
		} finally {
			loading = false;
		}
	}

	function toNum(v: number | string | undefined): number {
		if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
		if (typeof v === 'string') { const n = Number(v); return Number.isFinite(n) ? n : 0; }
		return 0;
	}

	function fmt(v: number): string {
		return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
	}

	$: filtered = allLines.filter(l => {
		if (statusFilter && l.accounting_status !== statusFilter) return false;
		return true;
	});

	$: totalTaxable = filtered.reduce((s, l) => s + toNum(l.taxable_amount), 0);
	$: totalWHT     = filtered.reduce((s, l) => s + toNum(l.tax_amount), 0);
	$: netAPPayable = totalTaxable - totalWHT;
	$: pendingCount = filtered.filter(l => l.accounting_status === 'pending').length;
	$: postedCount  = filtered.filter(l => l.accounting_status === 'posted').length;

	$: groupedByCode = Object.entries(
		filtered.reduce<Record<string, { taxable: number; wht: number; count: number }>>((acc, l) => {
			const key = l.tax_code_id ?? 'UNKNOWN';
			if (!acc[key]) acc[key] = { taxable: 0, wht: 0, count: 0 };
			acc[key].taxable += toNum(l.taxable_amount);
			acc[key].wht     += toNum(l.tax_amount);
			acc[key].count   += 1;
			return acc;
		}, {})
	);

	$: uniqueStatuses = [...new Set(allLines.map(l => l.accounting_status))].sort();
</script>

<section class="glass-panel p-6">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<div>
			<h2 class="text-2xl font-semibold">R2R Withholding Tax</h2>
			<p class="muted mt-2 text-sm">Supplier withholding tax accruals — gross AP, WHT deducted, and net payable to supplier.</p>
		</div>
		<button class="rounded-md border dark:border-white/35 border-slate-300 px-3 py-2 text-xs dark:text-white text-slate-900 dark:hover:bg-white/10 hover:bg-slate-500/10" on:click={loadData} disabled={loading}>
			{loading ? 'Refreshing...' : 'Refresh'}
		</button>
	</div>

	<div class="mt-4 grid gap-2 md:grid-cols-2">
		<select class="rounded-md border dark:border-white/25 border-slate-300 bg-[var(--input-bg)] px-3 py-2 text-sm" bind:value={statusFilter}>
			<option value="">All statuses</option>
			{#each uniqueStatuses as s (s)}<option value={s}>{s}</option>{/each}
		</select>
		<div class="flex items-center gap-3 text-sm dark:text-white/60 text-slate-500">
			<span>{pendingCount} pending</span>
			<span>·</span>
			<span>{postedCount} posted</span>
		</div>
	</div>

	{#if errorMessage}
		<p class="mt-4 rounded-md border border-red-500/55 bg-red-500/10 p-3 text-sm text-red-200">{errorMessage}</p>
	{:else if loading}
		<p class="mt-4 text-sm">Loading withholding tax data...</p>
	{:else}
		<div class="mt-4 grid gap-3 md:grid-cols-3">
			<div class="rounded-md border dark:border-white/15 border-slate-200 dark:bg-white/5 bg-slate-100/60 p-3">
				<p class="muted text-xs">Gross Payable to Suppliers</p>
				<p class="mt-2 text-xl font-semibold">{fmt(totalTaxable)}</p>
			</div>
			<div class="rounded-md border border-amber-500/50 bg-amber-500/10 p-3">
				<p class="muted text-xs">WHT to Remit to Authority</p>
				<p class="mt-2 text-xl font-semibold">{fmt(totalWHT)}</p>
			</div>
			<div class="rounded-md border border-emerald-500/50 bg-emerald-500/10 p-3">
				<p class="muted text-xs">Net Payable to Suppliers</p>
				<p class="mt-2 text-xl font-semibold">{fmt(netAPPayable)}</p>
			</div>
		</div>

		{#if groupedByCode.length > 0}
			<h3 class="mt-5 text-sm font-semibold uppercase tracking-widest dark:text-white/60 text-slate-500">Breakdown by WHT Code</h3>
			<div class="mt-2 overflow-x-auto">
				<table class="min-w-full text-left text-sm">
					<thead>
						<tr class="border-b dark:border-white/15 border-slate-200 text-xs uppercase tracking-[0.15em] dark:text-white/70 text-slate-600">
							<th class="px-3 py-2">Tax Code</th>
							<th class="px-3 py-2">Lines</th>
							<th class="px-3 py-2">Gross Amount</th>
							<th class="px-3 py-2">WHT Amount</th>
							<th class="px-3 py-2">Net Payable</th>
							<th class="px-3 py-2">Effective Rate</th>
						</tr>
					</thead>
					<tbody>
						{#each groupedByCode as [code, agg] (code)}
							<tr class="border-b dark:border-white/10 border-slate-200">
								<td class="px-3 py-3 font-mono text-xs">{code}</td>
								<td class="px-3 py-3">{agg.count}</td>
								<td class="px-3 py-3">{fmt(agg.taxable)}</td>
								<td class="px-3 py-3 font-semibold text-amber-300">{fmt(agg.wht)}</td>
								<td class="px-3 py-3 text-emerald-300">{fmt(agg.taxable - agg.wht)}</td>
								<td class="px-3 py-3 text-xs dark:text-white/70 text-slate-600">
									{agg.taxable > 0 ? fmt((agg.wht / agg.taxable) * 100) + ' %' : '—'}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}

		<h3 class="mt-5 text-sm font-semibold uppercase tracking-widest dark:text-white/60 text-slate-500">WHT Lines ({filtered.length})</h3>

		{#if filtered.length === 0}
			<p class="mt-2 text-sm">No withholding tax lines found.</p>
		{:else}
			<div class="mt-2 overflow-x-auto">
				<table class="min-w-full text-left text-sm">
					<thead>
						<tr class="border-b dark:border-white/15 border-slate-200 text-xs uppercase tracking-[0.15em] dark:text-white/70 text-slate-600">
							<th class="px-3 py-2">Source Entity</th>
							<th class="px-3 py-2">Tx Type</th>
							<th class="px-3 py-2">Tax Code</th>
							<th class="px-3 py-2">Gross Amount</th>
							<th class="px-3 py-2">WHT Amount</th>
							<th class="px-3 py-2">Net Payable</th>
							<th class="px-3 py-2">CCY</th>
							<th class="px-3 py-2">Status</th>
							<th class="px-3 py-2">Journal</th>
							<th class="px-3 py-2">Date</th>
						</tr>
					</thead>
					<tbody>
						{#each filtered as line (line.tax_transaction_line_id)}
							<tr class="border-b dark:border-white/10 border-slate-200">
								<td class="px-3 py-3 font-mono text-xs">{line.source_entity_id}</td>
								<td class="px-3 py-3 text-xs">{line.transaction_type}</td>
								<td class="px-3 py-3 text-xs">{line.tax_code_id ?? '—'}</td>
								<td class="px-3 py-3">{fmt(toNum(line.taxable_amount))}</td>
								<td class="px-3 py-3 font-semibold text-amber-300">{fmt(toNum(line.tax_amount))}</td>
								<td class="px-3 py-3 text-emerald-300">{fmt(toNum(line.taxable_amount) - toNum(line.tax_amount))}</td>
								<td class="px-3 py-3 text-xs">{line.currency_code}</td>
								<td class="px-3 py-3">
									<span class="rounded-full px-2 py-0.5 text-xs {line.accounting_status === 'posted' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'}">
										{line.accounting_status}
									</span>
								</td>
								<td class="px-3 py-3 font-mono text-xs dark:text-white/50 text-slate-500">{line.accounting_journal_id ?? '—'}</td>
								<td class="px-3 py-3 text-xs dark:text-white/60 text-slate-500">{line.created_at?.slice(0, 10) ?? '—'}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	{/if}
</section>
