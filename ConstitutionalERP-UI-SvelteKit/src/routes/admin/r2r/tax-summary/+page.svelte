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
	let lines: TaxLine[] = [];
	let statusFilter = '';
	let applicabilityFilter = '';

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
			lines = result.data ?? [];
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Unable to load tax lines.';
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

	$: filtered = lines.filter(l => {
		if (statusFilter && l.accounting_status !== statusFilter) return false;
		if (applicabilityFilter && l.tax_applicability !== applicabilityFilter) return false;
		return true;
	});

	$: totalTaxable = filtered.reduce((s, l) => s + toNum(l.taxable_amount), 0);
	$: totalTax    = filtered.reduce((s, l) => s + toNum(l.tax_amount), 0);

	$: vatOutput = filtered
		.filter(l => (l.tax_applicability === 'taxable' || l.tax_applicability === 'zero-rated' || l.tax_applicability === 'exempt') && l.transaction_type === 'ar-invoice')
		.reduce((s, l) => s + toNum(l.tax_amount), 0);

	$: vatInput = filtered
		.filter(l => (l.tax_applicability === 'taxable' || l.tax_applicability === 'zero-rated') && l.transaction_type === 'ap-invoice')
		.reduce((s, l) => s + toNum(l.tax_amount), 0);

	$: reverseCharge = filtered
		.filter(l => l.tax_applicability === 'reverse-charge')
		.reduce((s, l) => s + toNum(l.tax_amount), 0);

	$: wht = filtered
		.filter(l => l.tax_applicability === 'withholding')
		.reduce((s, l) => s + toNum(l.tax_amount), 0);

	$: netVatPosition = vatOutput - vatInput;
	$: uniqueApplicabilities = [...new Set(lines.map(l => l.tax_applicability))].sort();
	$: uniqueStatuses = [...new Set(lines.map(l => l.accounting_status))].sort();
</script>

<section class="glass-panel p-6">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<div>
			<h2 class="text-2xl font-semibold">R2R Tax Summary</h2>
			<p class="muted mt-2 text-sm">Aggregated VAT input/output, reverse-charge, and withholding tax across all posted transactions.</p>
		</div>
		<button class="rounded-md border dark:border-white/35 border-slate-300 px-3 py-2 text-xs dark:text-white text-slate-900 dark:hover:bg-white/10 hover:bg-slate-500/10" on:click={loadData} disabled={loading}>
			{loading ? 'Refreshing...' : 'Refresh'}
		</button>
	</div>

	<div class="mt-4 grid gap-2 md:grid-cols-2">
		<select class="rounded-md border dark:border-white/25 border-slate-300 bg-[var(--input-bg)] px-3 py-2 text-sm" bind:value={applicabilityFilter}>
			<option value="">All applicabilities</option>
			{#each uniqueApplicabilities as a (a)}<option value={a}>{a}</option>{/each}
		</select>
		<select class="rounded-md border dark:border-white/25 border-slate-300 bg-[var(--input-bg)] px-3 py-2 text-sm" bind:value={statusFilter}>
			<option value="">All statuses</option>
			{#each uniqueStatuses as s (s)}<option value={s}>{s}</option>{/each}
		</select>
	</div>

	{#if errorMessage}
		<p class="mt-4 rounded-md border border-red-500/55 bg-red-500/10 p-3 text-sm text-red-200">{errorMessage}</p>
	{:else if loading}
		<p class="mt-4 text-sm">Loading tax data...</p>
	{:else}
		<div class="mt-4 grid gap-3 md:grid-cols-3">
			<div class="rounded-md border dark:border-white/15 border-slate-200 dark:bg-white/5 bg-slate-100/60 p-3">
				<p class="muted text-xs">VAT Output (AR)</p>
				<p class="mt-2 text-xl font-semibold">{fmt(vatOutput)}</p>
			</div>
			<div class="rounded-md border dark:border-white/15 border-slate-200 dark:bg-white/5 bg-slate-100/60 p-3">
				<p class="muted text-xs">VAT Input (AP)</p>
				<p class="mt-2 text-xl font-semibold">{fmt(vatInput)}</p>
			</div>
			<div class={`rounded-md border p-3 ${netVatPosition >= 0 ? 'border-amber-500/50 bg-amber-500/10' : 'border-emerald-500/50 bg-emerald-500/10'}`}>
				<p class="muted text-xs">Net VAT Position (Output − Input)</p>
				<p class="mt-2 text-xl font-semibold">{fmt(netVatPosition)}</p>
			</div>
			<div class="rounded-md border dark:border-white/15 border-slate-200 dark:bg-white/5 bg-slate-100/60 p-3">
				<p class="muted text-xs">Reverse Charge VAT</p>
				<p class="mt-2 text-xl font-semibold">{fmt(reverseCharge)}</p>
			</div>
			<div class="rounded-md border dark:border-white/15 border-slate-200 dark:bg-white/5 bg-slate-100/60 p-3">
				<p class="muted text-xs">WHT Accrued</p>
				<p class="mt-2 text-xl font-semibold">{fmt(wht)}</p>
			</div>
			<div class="rounded-md border dark:border-white/15 border-slate-200 dark:bg-white/5 bg-slate-100/60 p-3">
				<p class="muted text-xs">Total Tax on {filtered.length} lines</p>
				<p class="mt-2 text-xl font-semibold">{fmt(totalTax)}</p>
			</div>
		</div>

		{#if filtered.length === 0}
			<p class="mt-4 text-sm">No tax transaction lines match the selected filters.</p>
		{:else}
			<div class="mt-4 overflow-x-auto">
				<table class="min-w-full text-left text-sm">
					<thead>
						<tr class="border-b dark:border-white/15 border-slate-200 text-xs uppercase tracking-[0.15em] dark:text-white/70 text-slate-600">
							<th class="px-3 py-2">Entity</th>
							<th class="px-3 py-2">Type</th>
							<th class="px-3 py-2">Applicability</th>
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
									<span class="rounded-full px-2 py-0.5 text-xs font-semibold {line.tax_applicability === 'taxable' ? 'bg-emerald-500/20 text-emerald-300' : line.tax_applicability === 'reverse-charge' ? 'bg-blue-500/20 text-blue-300' : line.tax_applicability === 'withholding' ? 'bg-amber-500/20 text-amber-300' : 'dark:bg-white/10 bg-slate-500/10 dark:text-white/70 text-slate-600'}">
										{line.tax_applicability}
									</span>
								</td>
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
