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

	const VAT_APPLICABILITIES = new Set(['taxable', 'zero-rated', 'exempt', 'reverse-charge']);

	let loading = false;
	let errorMessage = '';
	let allLines: TaxLine[] = [];
	let statusFilter = '';
	let txTypeFilter = '';

	onMount(() => {
		const unsub = actorStore.subscribe(() => { void loadData(); });
		return unsub;
	});

	async function loadData(): Promise<void> {
		loading = true;
		errorMessage = '';
		try {
			const result = await queryTable<TaxLine>('tax_transaction_line', $actorStore, 2000);
			allLines = (result.data ?? []).filter(l => VAT_APPLICABILITIES.has(l.tax_applicability));
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Unable to load VAT lines.';
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
		if (txTypeFilter && l.transaction_type !== txTypeFilter) return false;
		return true;
	});

	$: arLines  = filtered.filter(l => l.transaction_type === 'ar-invoice');
	$: apLines  = filtered.filter(l => l.transaction_type === 'ap-invoice');
	$: rcLines  = filtered.filter(l => l.tax_applicability === 'reverse-charge');

	$: totalTaxableAR = arLines.reduce((s, l) => s + toNum(l.taxable_amount), 0);
	$: totalVatAR     = arLines.reduce((s, l) => s + toNum(l.tax_amount), 0);
	$: totalTaxableAP = apLines.reduce((s, l) => s + toNum(l.taxable_amount), 0);
	$: totalVatAP     = apLines.reduce((s, l) => s + toNum(l.tax_amount), 0);
	$: totalRC        = rcLines.reduce((s, l) => s + toNum(l.tax_amount), 0);

	$: groupedByCode = Object.entries(
		filtered.reduce<Record<string, { taxable: number; tax: number; count: number }>>((acc, l) => {
			const key = l.tax_code_id ?? 'UNKNOWN';
			if (!acc[key]) acc[key] = { taxable: 0, tax: 0, count: 0 };
			acc[key].taxable += toNum(l.taxable_amount);
			acc[key].tax     += toNum(l.tax_amount);
			acc[key].count   += 1;
			return acc;
		}, {})
	);

	$: uniqueStatuses  = [...new Set(allLines.map(l => l.accounting_status))].sort();
	$: uniqueTxTypes   = [...new Set(allLines.map(l => l.transaction_type))].sort();
</script>

<section class="glass-panel p-6">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<div>
			<h2 class="text-2xl font-semibold">R2R VAT Report</h2>
			<p class="muted mt-2 text-sm">Sales and purchase VAT including standard-rated, zero-rated, exempt, and reverse-charge lines.</p>
		</div>
		<button class="rounded-md border dark:border-white/35 border-slate-300 px-3 py-2 text-xs dark:text-white text-slate-900 dark:hover:bg-white/10 hover:bg-slate-500/10" on:click={loadData} disabled={loading}>
			{loading ? 'Refreshing...' : 'Refresh'}
		</button>
	</div>

	<div class="mt-4 grid gap-2 md:grid-cols-2">
		<select class="rounded-md border dark:border-white/25 border-slate-300 bg-[var(--input-bg)] px-3 py-2 text-sm" bind:value={txTypeFilter}>
			<option value="">All transaction types</option>
			{#each uniqueTxTypes as t (t)}<option value={t}>{t}</option>{/each}
		</select>
		<select class="rounded-md border dark:border-white/25 border-slate-300 bg-[var(--input-bg)] px-3 py-2 text-sm" bind:value={statusFilter}>
			<option value="">All statuses</option>
			{#each uniqueStatuses as s (s)}<option value={s}>{s}</option>{/each}
		</select>
	</div>

	{#if errorMessage}
		<p class="mt-4 rounded-md border border-red-500/55 bg-red-500/10 p-3 text-sm text-red-200">{errorMessage}</p>
	{:else if loading}
		<p class="mt-4 text-sm">Loading VAT data...</p>
	{:else}
		<div class="mt-4 grid gap-3 md:grid-cols-3">
			<div class="rounded-md border dark:border-white/15 border-slate-200 dark:bg-white/5 bg-slate-100/60 p-3">
				<p class="muted text-xs">AR Taxable Amount</p>
				<p class="mt-2 text-xl font-semibold">{fmt(totalTaxableAR)}</p>
				<p class="muted mt-1 text-xs">Tax: {fmt(totalVatAR)}</p>
			</div>
			<div class="rounded-md border dark:border-white/15 border-slate-200 dark:bg-white/5 bg-slate-100/60 p-3">
				<p class="muted text-xs">AP Taxable Amount</p>
				<p class="mt-2 text-xl font-semibold">{fmt(totalTaxableAP)}</p>
				<p class="muted mt-1 text-xs">Input VAT: {fmt(totalVatAP)}</p>
			</div>
			<div class="rounded-md border border-blue-500/30 bg-blue-500/10 p-3">
				<p class="muted text-xs">Reverse Charge VAT</p>
				<p class="mt-2 text-xl font-semibold">{fmt(totalRC)}</p>
				<p class="muted mt-1 text-xs">{rcLines.length} line(s)</p>
			</div>
		</div>

		{#if groupedByCode.length > 0}
			<h3 class="mt-5 text-sm font-semibold uppercase tracking-widest dark:text-white/60 text-slate-500">Breakdown by Tax Code</h3>
			<div class="mt-2 overflow-x-auto">
				<table class="min-w-full text-left text-sm">
					<thead>
						<tr class="border-b dark:border-white/15 border-slate-200 text-xs uppercase tracking-[0.15em] dark:text-white/70 text-slate-600">
							<th class="px-3 py-2">Tax Code</th>
							<th class="px-3 py-2">Lines</th>
							<th class="px-3 py-2">Taxable Amount</th>
							<th class="px-3 py-2">Tax Amount</th>
							<th class="px-3 py-2">Effective Rate</th>
						</tr>
					</thead>
					<tbody>
						{#each groupedByCode as [code, agg] (code)}
							<tr class="border-b dark:border-white/10 border-slate-200">
								<td class="px-3 py-3 font-mono text-xs">{code}</td>
								<td class="px-3 py-3">{agg.count}</td>
								<td class="px-3 py-3">{fmt(agg.taxable)}</td>
								<td class="px-3 py-3 font-semibold">{fmt(agg.tax)}</td>
								<td class="px-3 py-3 text-xs dark:text-white/70 text-slate-600">
									{agg.taxable > 0 ? fmt((agg.tax / agg.taxable) * 100) + ' %' : '—'}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}

		<h3 class="mt-5 text-sm font-semibold uppercase tracking-widest dark:text-white/60 text-slate-500">Invoice Lines ({filtered.length})</h3>

		{#if filtered.length === 0}
			<p class="mt-2 text-sm">No VAT lines match the selected filters.</p>
		{:else}
			<div class="mt-2 overflow-x-auto">
				<table class="min-w-full text-left text-sm">
					<thead>
						<tr class="border-b dark:border-white/15 border-slate-200 text-xs uppercase tracking-[0.15em] dark:text-white/70 text-slate-600">
							<th class="px-3 py-2">Source Entity</th>
							<th class="px-3 py-2">Tx Type</th>
							<th class="px-3 py-2">Applicability</th>
							<th class="px-3 py-2">Tax Code</th>
							<th class="px-3 py-2">Taxable</th>
							<th class="px-3 py-2">Tax</th>
							<th class="px-3 py-2">CCY</th>
							<th class="px-3 py-2">Status</th>
							<th class="px-3 py-2">Date</th>
						</tr>
					</thead>
					<tbody>
						{#each filtered as line (line.tax_transaction_line_id)}
							<tr class="border-b dark:border-white/10 border-slate-200">
								<td class="px-3 py-3 font-mono text-xs">{line.source_entity_id}</td>
								<td class="px-3 py-3 text-xs">{line.transaction_type}</td>
								<td class="px-3 py-3">
									<span class="rounded-full px-2 py-0.5 text-xs font-semibold {line.tax_applicability === 'taxable' ? 'bg-emerald-500/20 text-emerald-300' : line.tax_applicability === 'reverse-charge' ? 'bg-blue-500/20 text-blue-300' : 'dark:bg-white/10 bg-slate-500/10 dark:text-white/70 text-slate-600'}">
										{line.tax_applicability}
									</span>
								</td>
								<td class="px-3 py-3 text-xs">{line.tax_code_id ?? '—'}</td>
								<td class="px-3 py-3">{fmt(toNum(line.taxable_amount))}</td>
								<td class="px-3 py-3 font-semibold">{fmt(toNum(line.tax_amount))}</td>
								<td class="px-3 py-3 text-xs">{line.currency_code}</td>
								<td class="px-3 py-3">
									<span class="rounded-full px-2 py-0.5 text-xs {line.accounting_status === 'posted' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'}">
										{line.accounting_status}
									</span>
								</td>
								<td class="px-3 py-3 text-xs dark:text-white/60 text-slate-500">{line.created_at?.slice(0, 10) ?? '—'}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	{/if}
</section>
