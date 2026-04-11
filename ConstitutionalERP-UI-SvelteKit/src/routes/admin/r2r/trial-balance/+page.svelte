<script lang="ts">
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import { getTrialBalance, type TrialBalanceRow } from '$lib/api/r2r';
	import { queryTable } from '$lib/api/query';
	import { actorStore } from '$lib/stores/actorStore';

	interface FiscalPeriodRow {
		fiscal_period_id: string;
		period_number?: number;
		start_date?: string;
		end_date?: string;
		state?: string;
	}

	let loading = false;
	let errorMessage = '';
	let fiscalPeriods: FiscalPeriodRow[] = [];
	let selectedPeriodId = '';
	let rows: TrialBalanceRow[] = [];
	let accountFilter = '';

	onMount(() => {
		const unsubscribeActor = actorStore.subscribe(() => {
			void loadPageData();
		});

		void loadPageData();

		return () => {
			unsubscribeActor();
		};
	});

	async function loadPageData(): Promise<void> {
		loading = true;
		errorMessage = '';

		try {
			const periodResult = await queryTable<FiscalPeriodRow>('r2r_fiscal_period', $actorStore, 500);
			fiscalPeriods = (periodResult.data ?? []).sort((left, right) =>
				String(right.fiscal_period_id).localeCompare(String(left.fiscal_period_id))
			);

			if (!selectedPeriodId && fiscalPeriods.length > 0) {
				selectedPeriodId = fiscalPeriods[0].fiscal_period_id;
			}

			await loadTrialBalance();
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Unable to load trial balance page.';
		} finally {
			loading = false;
		}
	}

	async function loadTrialBalance(): Promise<void> {
		if (!selectedPeriodId) {
			rows = [];
			return;
		}

		try {
			const result = await getTrialBalance(selectedPeriodId, $actorStore);
			rows = result.data ?? [];
		} catch {
			// Fallback to query-table path if the trial-balance route is unavailable.
			const queryResult = await queryTable<TrialBalanceRow>('r2r_trial_balance_row', $actorStore, 500);
			rows = (queryResult.data ?? []).filter((row) => row.fiscal_period_id === selectedPeriodId);
		}
	}

	function toNumber(value: unknown): number {
		if (typeof value === 'number' && Number.isFinite(value)) {
			return value;
		}
		if (typeof value === 'string' && value.trim()) {
			const parsed = Number(value);
			return Number.isFinite(parsed) ? parsed : 0;
		}
		return 0;
	}

	function formatAmount(value: number): string {
		return value.toLocaleString(undefined, {
			minimumFractionDigits: 2,
			maximumFractionDigits: 2
		});
	}

	function periodLabel(period: FiscalPeriodRow): string {
		const numberPart = period.period_number ? `P${period.period_number}` : period.fiscal_period_id;
		const statePart = period.state ? ` (${period.state})` : '';
		return `${numberPart}${statePart}`;
	}

	$: visibleRows = rows.filter((row) => {
		if (!accountFilter.trim()) {
			return true;
		}
		return String(row.account_id ?? '')
			.toLowerCase()
			.includes(accountFilter.trim().toLowerCase());
	});

	$: totalDebit = visibleRows.reduce((sum, row) => sum + toNumber(row.debit_total), 0);
	$: totalCredit = visibleRows.reduce((sum, row) => sum + toNumber(row.credit_total), 0);
	$: balanced = Math.round(totalDebit * 100) === Math.round(totalCredit * 100);
</script>

<section class="glass-panel p-6">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<div>
			<h2 class="text-2xl font-semibold">R2R Trial Balance</h2>
			<p class="muted mt-2 text-sm">Period-level debit/credit balance with account drilldown to ledger entries.</p>
		</div>
		<button class="rounded-md border dark:border-white/35 border-slate-300 px-3 py-2 text-xs dark:text-white text-slate-900 dark:hover:bg-white/10 hover:bg-slate-500/10" on:click={loadPageData} disabled={loading}>
			{loading ? 'Refreshing...' : 'Refresh'}
		</button>
	</div>

	<div class="mt-4 grid gap-2 md:grid-cols-3">
		<select class="rounded-md border dark:border-white/25 border-slate-300 bg-[var(--input-bg)] px-3 py-2 text-sm" bind:value={selectedPeriodId} on:change={loadTrialBalance}>
			<option value="">Select fiscal period</option>
			{#each fiscalPeriods as period (period.fiscal_period_id)}
				<option value={period.fiscal_period_id}>{periodLabel(period)}</option>
			{/each}
		</select>
		<input class="rounded-md border dark:border-white/25 border-slate-300 bg-[var(--input-bg)] px-3 py-2 text-sm" placeholder="Filter by account id" bind:value={accountFilter} />
	</div>

	{#if errorMessage}
		<p class="mt-4 rounded-md border border-red-500/55 bg-red-500/10 p-3 text-sm text-red-200">{errorMessage}</p>
	{:else if loading}
		<p class="mt-4 text-sm">Loading trial balance...</p>
	{:else if !selectedPeriodId}
		<p class="mt-4 text-sm">Choose a fiscal period to view balances.</p>
	{:else}
		<div class="mt-4 grid gap-3 md:grid-cols-3">
			<div class="rounded-md border dark:border-white/15 border-slate-200 dark:bg-white/5 bg-slate-100/60 p-3">
				<p class="muted text-xs">Total debit</p>
				<p class="mt-2 text-xl font-semibold">{formatAmount(totalDebit)}</p>
			</div>
			<div class="rounded-md border dark:border-white/15 border-slate-200 dark:bg-white/5 bg-slate-100/60 p-3">
				<p class="muted text-xs">Total credit</p>
				<p class="mt-2 text-xl font-semibold">{formatAmount(totalCredit)}</p>
			</div>
			<div class={`rounded-md border p-3 ${balanced ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-red-500/50 bg-red-500/10'}`}>
				<p class="muted text-xs">Parity check</p>
				<p class="mt-2 text-xl font-semibold">{balanced ? 'Balanced' : 'Out of balance'}</p>
			</div>
		</div>

		{#if visibleRows.length === 0}
			<p class="mt-4 text-sm">No trial-balance rows for the selected filters.</p>
		{:else}
			<div class="mt-4 overflow-x-auto">
				<table class="min-w-full text-left text-sm">
					<thead>
						<tr class="border-b dark:border-white/15 border-slate-200 text-xs uppercase tracking-[0.15em] dark:text-white/70 text-slate-600">
							<th class="px-3 py-2">Account</th>
							<th class="px-3 py-2">Debit</th>
							<th class="px-3 py-2">Credit</th>
							<th class="px-3 py-2">Drilldown</th>
						</tr>
					</thead>
					<tbody>
						{#each visibleRows as row (row.trial_balance_row_id)}
							<tr class="border-b dark:border-white/10 border-slate-200">
								<td class="px-3 py-3 font-semibold">{row.account_id}</td>
								<td class="px-3 py-3">{formatAmount(toNumber(row.debit_total))}</td>
								<td class="px-3 py-3">{formatAmount(toNumber(row.credit_total))}</td>
								<td class="px-3 py-3">
									<a class="rounded-md border dark:border-white/35 border-slate-300 px-2 py-1 text-xs dark:text-white text-slate-900 dark:hover:bg-white/10 hover:bg-slate-500/10" href={resolve(`/admin/r2r/ledger-entries?periodId=${selectedPeriodId}&accountId=${encodeURIComponent(String(row.account_id ?? ''))}`)}>
										View Entries
									</a>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	{/if}
</section>
