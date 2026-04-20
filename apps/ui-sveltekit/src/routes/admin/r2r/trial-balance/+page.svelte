<script lang="ts">
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import { getTrialBalance, type TrialBalanceRow } from '$lib/api/r2r';
	import { queryTable } from '$lib/api/query';
	import { actorStore } from '$lib/stores/actorStore';

	type ReportTab = 'trial-balance' | 'sfp' | 'sopl' | 'scf' | 'sce';

	interface FiscalYearRow {
		fiscal_year_id: string;
		year_label?: string;
		state?: string;
		start_date?: string;
		end_date?: string;
	}

	interface FiscalPeriodRow {
		fiscal_period_id: string;
		fiscal_year_id?: string;
		period_number?: number;
		start_date?: string;
		end_date?: string;
		state?: string;
	}

	interface AccountRow {
		account_id: string;
		account_code?: string;
		account_name?: string;
		account_type?: string;
		parent_account_id?: string;
	}

	interface EnrichedRow extends TrialBalanceRow {
		account_code: string;
		account_name: string;
		account_type: string;
		net: number;
	}

	const TAB_LABELS: Record<ReportTab, string> = {
		'trial-balance': 'Trial Balance',
		sfp: 'Financial Position',
		sopl: 'Profit & Loss',
		scf: 'Cash Flows',
		sce: 'Changes in Equity'
	};

	const ALL_TABS = Object.keys(TAB_LABELS) as ReportTab[];

	let loading = false;
	let errorMessage = '';
	let activeTab: ReportTab = 'trial-balance';
	let fiscalYears: FiscalYearRow[] = [];
	let allPeriods: FiscalPeriodRow[] = [];
	let accounts: AccountRow[] = [];
	let trialBalanceRows: TrialBalanceRow[] = [];
	let selectedYearId = '';
	let selectedPeriodId = '';
	let accountFilter = '';

	// Token-based stale-request guard: each new load round increments this;
	// async callbacks check their captured token against the current one before writing state.
	let requestToken = 0;

	onMount(() => {
		const unsubscribeActor = actorStore.subscribe(() => {
			void loadPageData();
		});
		// actorStore.subscribe invokes immediately with current value,
		// so this yields a single initial load and avoids duplicate races.
		return unsubscribeActor;
	});

	async function loadPageData(): Promise<void> {
		const token = ++requestToken;
		loading = true;
		errorMessage = '';

		try {
			const [yearsResult, periodsResult, accountsResult] = await Promise.all([
				queryTable<FiscalYearRow>('r2r_fiscal_year', $actorStore, 200),
				queryTable<FiscalPeriodRow>('r2r_fiscal_period', $actorStore, 500),
				queryTable<AccountRow>('r2r_account', $actorStore, 2000)
			]);

			if (token !== requestToken) return;

			fiscalYears = (yearsResult.data ?? []).sort((a, b) =>
				String(b.year_label ?? b.fiscal_year_id).localeCompare(String(a.year_label ?? a.fiscal_year_id))
			);
			allPeriods = periodsResult.data ?? [];
			accounts = accountsResult.data ?? [];

			if (!selectedYearId && fiscalYears.length > 0) {
				selectedYearId = fiscalYears[0].fiscal_year_id;
			}

			const yearPeriods = periodsForYear(selectedYearId);
			if (!selectedPeriodId && yearPeriods.length > 0) {
				selectedPeriodId = yearPeriods[0].fiscal_period_id;
			}

			await loadTrialBalance(token);
		} catch (err) {
			if (token !== requestToken) return;
			errorMessage = err instanceof Error ? err.message : 'Unable to load financial reports.';
		} finally {
			if (token === requestToken) loading = false;
		}
	}

	async function loadTrialBalance(token: number): Promise<void> {
		if (!selectedPeriodId) {
			trialBalanceRows = [];
			return;
		}
		try {
			const result = await getTrialBalance(selectedPeriodId, $actorStore);
			if (token !== requestToken) return;
			trialBalanceRows = result.data ?? [];
		} catch {
			const fallback = await queryTable<TrialBalanceRow>('r2r_trial_balance_row', $actorStore, 500);
			if (token !== requestToken) return;
			trialBalanceRows = (fallback.data ?? []).filter((r) => r.fiscal_period_id === selectedPeriodId);
		}
	}

	async function onYearChange(): Promise<void> {
		selectedPeriodId = '';
		const yearPeriods = periodsForYear(selectedYearId);
		if (yearPeriods.length > 0) selectedPeriodId = yearPeriods[0].fiscal_period_id;
		await onPeriodChange();
	}

	async function onPeriodChange(): Promise<void> {
		const token = ++requestToken;
		loading = true;
		errorMessage = '';
		try {
			await loadTrialBalance(token);
		} catch (err) {
			if (token !== requestToken) return;
			errorMessage = err instanceof Error ? err.message : 'Unable to load report data.';
		} finally {
			if (token === requestToken) loading = false;
		}
	}

	function periodsForYear(yearId: string): FiscalPeriodRow[] {
		return allPeriods
			.filter((p) => p.fiscal_year_id === yearId)
			.sort((a, b) => (a.period_number ?? 0) - (b.period_number ?? 0));
	}

	function toNumber(value: unknown): number {
		if (typeof value === 'number' && Number.isFinite(value)) return value;
		if (typeof value === 'string' && value.trim()) {
			const parsed = Number(value);
			return Number.isFinite(parsed) ? parsed : 0;
		}
		return 0;
	}

	function fmt(value: number): string {
		return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
	}

	function periodLabel(p: FiscalPeriodRow): string {
		const num = p.period_number ? `P${p.period_number}` : p.fiscal_period_id;
		const dates = p.start_date && p.end_date ? ` ${p.start_date.slice(0, 7)}` : '';
		const state = p.state ? ` (${p.state})` : '';
		return `${num}${dates}${state}`;
	}

	// ── Derived data ──────────────────────────────────────────────────────────

	$: accountMap = new Map<string, AccountRow>(accounts.map((a) => [a.account_id, a]));

	$: enriched = trialBalanceRows.map((row): EnrichedRow => {
		const acct = accountMap.get(row.account_id);
		const debit = toNumber(row.debit_total);
		const credit = toNumber(row.credit_total);
		return {
			...row,
			account_code: acct?.account_code ?? row.account_id,
			account_name: acct?.account_name ?? row.account_id,
			account_type: acct?.account_type ?? 'Unknown',
			net: debit - credit
		};
	});

	$: visibleRows = enriched.filter((r) => {
		if (!accountFilter.trim()) return true;
		const q = accountFilter.trim().toLowerCase();
		return (
			r.account_id.toLowerCase().includes(q) ||
			r.account_code.toLowerCase().includes(q) ||
			r.account_name.toLowerCase().includes(q)
		);
	});

	$: byType = (type: string) => enriched.filter((r) => r.account_type === type);
	$: assetRows = byType('Asset');
	$: liabilityRows = byType('Liability');
	$: equityRows = byType('Equity');
	$: revenueRows = byType('Revenue');
	$: expenseRows = byType('Expense');

	// Assets: debit-normal → net positive = asset balance
	$: totalAssets = assetRows.reduce((s, r) => s + r.net, 0);
	// Liabilities: credit-normal → net negative = liability; take absolute
	$: totalLiabilities = liabilityRows.reduce((s, r) => s + Math.abs(r.net), 0);
	$: totalEquity = equityRows.reduce((s, r) => s + Math.abs(r.net), 0);
	$: totalRevenue = revenueRows.reduce((s, r) => s + Math.abs(r.net), 0);
	$: totalExpenses = expenseRows.reduce((s, r) => s + r.net, 0);
	$: netIncome = totalRevenue - totalExpenses;

	$: totalDebit = enriched.reduce((s, r) => s + toNumber(r.debit_total), 0);
	$: totalCredit = enriched.reduce((s, r) => s + toNumber(r.credit_total), 0);
	$: balanced = Math.round(totalDebit * 100) === Math.round(totalCredit * 100);

	// Cash Flow: approximate indirect method
	$: cashRows = assetRows.filter(
		(r) => r.account_name.toLowerCase().includes('cash') || r.account_code.toLowerCase().includes('cash')
	);
	$: netCashMovement = cashRows.reduce((s, r) => s + r.net, 0);

	// Opening equity: for Changes in Equity, opening balance is not available without prior-period data
	$: closingEquity = totalEquity + netIncome;

	$: currentYearPeriods = periodsForYear(selectedYearId);
	$: selectedPeriod = currentYearPeriods.find((p) => p.fiscal_period_id === selectedPeriodId);
	$: periodContext = selectedPeriod
		? `${selectedPeriod.start_date ?? ''} – ${selectedPeriod.end_date ?? ''}`
		: '';
</script>

<section class="glass-panel p-6">
	<!-- ── Header ── -->
	<div class="flex flex-wrap items-center justify-between gap-3">
		<div>
			<h2 class="text-2xl font-semibold">Financial Reports</h2>
			<p class="muted mt-1 text-sm">IFRS-aligned statements derived from the general ledger. Select a fiscal year and period.</p>
		</div>
		<button
			class="rounded-md border dark:border-white/35 border-slate-300 px-3 py-2 text-xs dark:text-white text-slate-900 dark:hover:bg-white/10 hover:bg-slate-500/10 disabled:opacity-40"
			on:click={loadPageData}
			disabled={loading}
		>
			{loading ? 'Refreshing…' : 'Refresh'}
		</button>
	</div>

	<!-- ── Filters ── -->
	<div class="mt-4 flex flex-wrap gap-2">
		<select
			class="rounded-md border dark:border-white/25 border-slate-300 bg-[var(--input-bg)] px-3 py-2 text-sm"
			bind:value={selectedYearId}
			on:change={onYearChange}
		>
			<option value="">Select fiscal year</option>
			{#each fiscalYears as yr (yr.fiscal_year_id)}
				<option value={yr.fiscal_year_id}>{yr.year_label ?? yr.fiscal_year_id}{yr.state ? ` (${yr.state})` : ''}</option>
			{/each}
		</select>
		<select
			class="rounded-md border dark:border-white/25 border-slate-300 bg-[var(--input-bg)] px-3 py-2 text-sm"
			bind:value={selectedPeriodId}
			on:change={onPeriodChange}
		>
			<option value="">Select period</option>
			{#each currentYearPeriods as p (p.fiscal_period_id)}
				<option value={p.fiscal_period_id}>{periodLabel(p)}</option>
			{/each}
		</select>
	</div>

	<!-- ── State feedback ── -->
	{#if errorMessage}
		<div class="mt-4 flex items-center gap-3 rounded-md border border-red-500/55 bg-red-500/10 p-3 text-sm">
			<span class="text-red-200 flex-1">{errorMessage}</span>
			<button class="rounded-md border border-red-400/60 px-3 py-1 text-xs text-red-300 hover:bg-red-500/20" on:click={loadPageData}>Retry</button>
		</div>
	{:else if loading}
		<div class="mt-4 space-y-2">
			<div class="h-4 w-48 animate-pulse rounded dark:bg-white/10 bg-slate-200"></div>
			<div class="h-32 w-full animate-pulse rounded dark:bg-white/5 bg-slate-100"></div>
		</div>
	{:else if !selectedPeriodId}
		<p class="muted mt-6 text-sm">Choose a fiscal year and period to view reports.</p>
	{:else}
		<!-- ── Tab bar ── -->
		<div class="mt-5 flex flex-wrap gap-2 border-b dark:border-white/10 border-slate-200 pb-3">
			{#each ALL_TABS as tab (tab)}
				<button
					type="button"
					class={`rounded-md px-3 py-2 text-sm transition ${activeTab === tab ? 'dark:bg-white dark:text-slate-900 bg-slate-900 text-white' : 'dark:bg-white/10 bg-slate-500/10 dark:hover:bg-white/20 hover:bg-slate-500/20'}`}
					on:click={() => (activeTab = tab)}
				>
					{TAB_LABELS[tab]}
				</button>
			{/each}
		</div>

		<p class="muted mt-3 text-xs">Period: {periodContext || selectedPeriodId}</p>

		<!-- ════════════════════════════════════════════════════════════
		     TAB: Trial Balance
		     ════════════════════════════════════════════════════════════ -->
		{#if activeTab === 'trial-balance'}
			<div class="mt-4 grid gap-3 md:grid-cols-3">
				<div class="rounded-md border dark:border-white/15 border-slate-200 dark:bg-white/5 bg-slate-100/60 p-3">
					<p class="muted text-xs">Total Debit</p>
					<p class="mt-1 text-xl font-semibold">{fmt(totalDebit)}</p>
				</div>
				<div class="rounded-md border dark:border-white/15 border-slate-200 dark:bg-white/5 bg-slate-100/60 p-3">
					<p class="muted text-xs">Total Credit</p>
					<p class="mt-1 text-xl font-semibold">{fmt(totalCredit)}</p>
				</div>
				<div class={`rounded-md border p-3 ${balanced ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-red-500/50 bg-red-500/10'}`}>
					<p class="muted text-xs">Parity</p>
					<p class="mt-1 text-xl font-semibold">{balanced ? '✓ Balanced' : '✗ Out of balance'}</p>
				</div>
			</div>

			<div class="mt-3">
				<input
					class="rounded-md border dark:border-white/25 border-slate-300 bg-[var(--input-bg)] px-3 py-2 text-sm w-full md:w-72"
					placeholder="Filter by account code or name…"
					bind:value={accountFilter}
				/>
			</div>

			{#if visibleRows.length === 0}
				<p class="muted mt-4 text-sm">No trial-balance rows match the current filter.</p>
			{:else}
				<div class="mt-3 overflow-x-auto">
					<table class="min-w-full text-left text-sm">
						<thead>
							<tr class="border-b dark:border-white/15 border-slate-200 text-xs uppercase tracking-[0.15em] dark:text-white/70 text-slate-600">
								<th class="px-3 py-2">Code</th>
								<th class="px-3 py-2">Name</th>
								<th class="px-3 py-2">Type</th>
								<th class="px-3 py-2 text-right">Debit</th>
								<th class="px-3 py-2 text-right">Credit</th>
								<th class="px-3 py-2">Entries</th>
							</tr>
						</thead>
						<tbody>
							{#each visibleRows as row (row.trial_balance_row_id)}
								<tr class="border-b dark:border-white/10 border-slate-200 dark:hover:bg-white/5 hover:bg-slate-50">
									<td class="px-3 py-2 font-mono text-xs">{row.account_code}</td>
									<td class="px-3 py-2">{row.account_name}</td>
									<td class="px-3 py-2">
										<span class={`rounded px-1.5 py-0.5 text-xs ${{
											Asset: 'bg-blue-500/20 text-blue-300',
											Liability: 'bg-amber-500/20 text-amber-300',
											Equity: 'bg-purple-500/20 text-purple-300',
											Revenue: 'bg-emerald-500/20 text-emerald-300',
											Expense: 'bg-red-500/20 text-red-300',
											Unknown: 'bg-slate-500/20 dark:text-white/50 text-slate-500'
										}[row.account_type] ?? 'bg-slate-500/20'}`}>{row.account_type}</span>
									</td>
									<td class="px-3 py-2 text-right tabular-nums">{fmt(toNumber(row.debit_total))}</td>
									<td class="px-3 py-2 text-right tabular-nums">{fmt(toNumber(row.credit_total))}</td>
									<td class="px-3 py-2">
										<a
											class="rounded-md border dark:border-white/35 border-slate-300 px-2 py-1 text-xs dark:text-white text-slate-900 dark:hover:bg-white/10 hover:bg-slate-500/10"
											href={resolve(`/admin/r2r/ledger-entries?periodId=${selectedPeriodId}&accountId=${encodeURIComponent(row.account_id)}`)}
										>View</a>
									</td>
								</tr>
							{/each}
						</tbody>
						<tfoot>
							<tr class="border-t dark:border-white/20 border-slate-300 font-semibold">
								<td class="px-3 py-2" colspan="3">Total</td>
								<td class="px-3 py-2 text-right tabular-nums">{fmt(totalDebit)}</td>
								<td class="px-3 py-2 text-right tabular-nums">{fmt(totalCredit)}</td>
								<td></td>
							</tr>
						</tfoot>
					</table>
				</div>
			{/if}
		{/if}

		<!-- ════════════════════════════════════════════════════════════
		     TAB: Statement of Financial Position (Balance Sheet)
		     IAS 1 – Assets / Liabilities / Equity
		     ════════════════════════════════════════════════════════════ -->
		{#if activeTab === 'sfp'}
			{#if enriched.length === 0}
				<p class="muted mt-6 text-sm">No ledger data for this period.</p>
			{:else}
				<!-- KPI row -->
				<div class="mt-4 grid gap-3 md:grid-cols-3">
					<div class="rounded-md border dark:border-white/15 border-slate-200 dark:bg-white/5 bg-slate-100/60 p-3">
						<p class="muted text-xs">Total Assets</p>
						<p class="mt-1 text-xl font-semibold">{fmt(totalAssets)}</p>
					</div>
					<div class="rounded-md border dark:border-white/15 border-slate-200 dark:bg-white/5 bg-slate-100/60 p-3">
						<p class="muted text-xs">Total Liabilities</p>
						<p class="mt-1 text-xl font-semibold">{fmt(totalLiabilities)}</p>
					</div>
					<div class={`rounded-md border p-3 ${Math.abs(totalAssets - (totalLiabilities + totalEquity + netIncome)) < 1 ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-amber-500/50 bg-amber-500/10'}`}>
						<p class="muted text-xs">Equity incl. period income</p>
						<p class="mt-1 text-xl font-semibold">{fmt(totalEquity + netIncome)}</p>
					</div>
				</div>

				<div class="mt-5 grid gap-6 md:grid-cols-2">
					<!-- Assets -->
					<div>
						<h3 class="mb-2 text-sm font-semibold uppercase tracking-wider dark:text-white/70 text-slate-600">Assets</h3>
						<table class="min-w-full text-sm">
							<thead>
								<tr class="border-b dark:border-white/15 border-slate-200 text-xs dark:text-white/50 text-slate-500">
									<th class="px-2 py-1 text-left">Account</th>
									<th class="px-2 py-1 text-right">Balance</th>
								</tr>
							</thead>
							<tbody>
								{#each assetRows as r (r.trial_balance_row_id)}
									<tr class="border-b dark:border-white/10 border-slate-100">
										<td class="px-2 py-2">
											<span class="text-xs font-mono dark:text-white/50 text-slate-400">{r.account_code}</span>
											<span class="ml-2">{r.account_name}</span>
										</td>
										<td class="px-2 py-2 text-right tabular-nums">{fmt(r.net)}</td>
									</tr>
								{/each}
							</tbody>
							<tfoot>
								<tr class="border-t-2 dark:border-white/25 border-slate-300 font-semibold">
									<td class="px-2 py-2">Total Assets</td>
									<td class="px-2 py-2 text-right tabular-nums">{fmt(totalAssets)}</td>
								</tr>
							</tfoot>
						</table>
					</div>

					<!-- Liabilities & Equity -->
					<div>
						<h3 class="mb-2 text-sm font-semibold uppercase tracking-wider dark:text-white/70 text-slate-600">Liabilities</h3>
						<table class="min-w-full text-sm">
							<thead>
								<tr class="border-b dark:border-white/15 border-slate-200 text-xs dark:text-white/50 text-slate-500">
									<th class="px-2 py-1 text-left">Account</th>
									<th class="px-2 py-1 text-right">Balance</th>
								</tr>
							</thead>
							<tbody>
								{#each liabilityRows as r (r.trial_balance_row_id)}
									<tr class="border-b dark:border-white/10 border-slate-100">
										<td class="px-2 py-2">
											<span class="text-xs font-mono dark:text-white/50 text-slate-400">{r.account_code}</span>
											<span class="ml-2">{r.account_name}</span>
										</td>
										<td class="px-2 py-2 text-right tabular-nums">{fmt(Math.abs(r.net))}</td>
									</tr>
								{/each}
							</tbody>
							<tfoot>
								<tr class="border-t dark:border-white/15 border-slate-200 font-semibold">
									<td class="px-2 py-2">Total Liabilities</td>
									<td class="px-2 py-2 text-right tabular-nums">{fmt(totalLiabilities)}</td>
								</tr>
							</tfoot>
						</table>

						<h3 class="mb-2 mt-5 text-sm font-semibold uppercase tracking-wider dark:text-white/70 text-slate-600">Equity</h3>
						<table class="min-w-full text-sm">
							<tbody>
								{#each equityRows as r (r.trial_balance_row_id)}
									<tr class="border-b dark:border-white/10 border-slate-100">
										<td class="px-2 py-2">
											<span class="text-xs font-mono dark:text-white/50 text-slate-400">{r.account_code}</span>
											<span class="ml-2">{r.account_name}</span>
										</td>
										<td class="px-2 py-2 text-right tabular-nums">{fmt(Math.abs(r.net))}</td>
									</tr>
								{/each}
								<tr class="border-b dark:border-white/10 border-slate-100 dark:text-emerald-400 text-emerald-600">
									<td class="px-2 py-2 italic">Net income (period)</td>
									<td class="px-2 py-2 text-right tabular-nums">{fmt(netIncome)}</td>
								</tr>
							</tbody>
							<tfoot>
								<tr class="border-t-2 dark:border-white/25 border-slate-300 font-semibold">
									<td class="px-2 py-2">Total Equity</td>
									<td class="px-2 py-2 text-right tabular-nums">{fmt(totalEquity + netIncome)}</td>
								</tr>
							</tfoot>
						</table>

						<div class="mt-4 rounded-md border dark:border-white/15 border-slate-200 dark:bg-white/5 bg-slate-50 p-3 text-sm">
							<span class="font-semibold">Liabilities + Equity</span>
							<span class="float-right tabular-nums font-semibold">{fmt(totalLiabilities + totalEquity + netIncome)}</span>
						</div>
					</div>
				</div>
			{/if}
		{/if}

		<!-- ════════════════════════════════════════════════════════════
		     TAB: Statement of Profit or Loss
		     IAS 1 – Revenue / Expenses / Net Income
		     ════════════════════════════════════════════════════════════ -->
		{#if activeTab === 'sopl'}
			{#if enriched.length === 0}
				<p class="muted mt-6 text-sm">No ledger data for this period.</p>
			{:else}
				<div class="mt-4 grid gap-3 md:grid-cols-3">
					<div class="rounded-md border dark:border-white/15 border-slate-200 dark:bg-white/5 bg-slate-100/60 p-3">
						<p class="muted text-xs">Total Revenue</p>
						<p class="mt-1 text-xl font-semibold dark:text-emerald-400 text-emerald-600">{fmt(totalRevenue)}</p>
					</div>
					<div class="rounded-md border dark:border-white/15 border-slate-200 dark:bg-white/5 bg-slate-100/60 p-3">
						<p class="muted text-xs">Total Expenses</p>
						<p class="mt-1 text-xl font-semibold dark:text-red-400 text-red-600">{fmt(totalExpenses)}</p>
					</div>
					<div class={`rounded-md border p-3 ${netIncome >= 0 ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-red-500/50 bg-red-500/10'}`}>
						<p class="muted text-xs">Net Income / (Loss)</p>
						<p class={`mt-1 text-xl font-semibold ${netIncome >= 0 ? 'dark:text-emerald-400 text-emerald-600' : 'dark:text-red-400 text-red-600'}`}>{fmt(netIncome)}</p>
					</div>
				</div>

				<div class="mt-5 max-w-2xl space-y-6">
					<!-- Revenue -->
					<div>
						<h3 class="mb-2 border-b dark:border-white/15 border-slate-200 pb-1 text-sm font-semibold uppercase tracking-wider dark:text-emerald-400 text-emerald-600">Revenue</h3>
						<table class="min-w-full text-sm">
							<tbody>
								{#each revenueRows as r (r.trial_balance_row_id)}
									<tr class="border-b dark:border-white/10 border-slate-100">
										<td class="px-2 py-2">
											<span class="text-xs font-mono dark:text-white/50 text-slate-400">{r.account_code}</span>
											<span class="ml-2">{r.account_name}</span>
										</td>
										<td class="px-2 py-2 text-right tabular-nums">{fmt(Math.abs(r.net))}</td>
									</tr>
								{/each}
							</tbody>
							<tfoot>
								<tr class="border-t dark:border-white/15 border-slate-200 font-semibold dark:text-emerald-400 text-emerald-600">
									<td class="px-2 py-2">Total Revenue</td>
									<td class="px-2 py-2 text-right tabular-nums">{fmt(totalRevenue)}</td>
								</tr>
							</tfoot>
						</table>
					</div>

					<!-- Expenses -->
					<div>
						<h3 class="mb-2 border-b dark:border-white/15 border-slate-200 pb-1 text-sm font-semibold uppercase tracking-wider dark:text-red-400 text-red-600">Expenses</h3>
						<table class="min-w-full text-sm">
							<tbody>
								{#each expenseRows as r (r.trial_balance_row_id)}
									<tr class="border-b dark:border-white/10 border-slate-100">
										<td class="px-2 py-2">
											<span class="text-xs font-mono dark:text-white/50 text-slate-400">{r.account_code}</span>
											<span class="ml-2">{r.account_name}</span>
										</td>
										<td class="px-2 py-2 text-right tabular-nums">{fmt(r.net)}</td>
									</tr>
								{/each}
							</tbody>
							<tfoot>
								<tr class="border-t dark:border-white/15 border-slate-200 font-semibold dark:text-red-400 text-red-600">
									<td class="px-2 py-2">Total Expenses</td>
									<td class="px-2 py-2 text-right tabular-nums">{fmt(totalExpenses)}</td>
								</tr>
							</tfoot>
						</table>
					</div>

					<!-- Net Income line -->
					<div class={`rounded-md border-2 p-4 ${netIncome >= 0 ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-red-500/50 bg-red-500/10'}`}>
						<div class="flex items-center justify-between">
							<span class="font-semibold">{netIncome >= 0 ? 'Net Income' : 'Net Loss'}</span>
							<span class={`text-xl font-bold tabular-nums ${netIncome >= 0 ? 'dark:text-emerald-400 text-emerald-600' : 'dark:text-red-400 text-red-600'}`}>{fmt(Math.abs(netIncome))}</span>
						</div>
					</div>
				</div>
			{/if}
		{/if}

		<!-- ════════════════════════════════════════════════════════════
		     TAB: Statement of Cash Flows (IAS 7 – Indirect method)
		     ════════════════════════════════════════════════════════════ -->
		{#if activeTab === 'scf'}
			{#if enriched.length === 0}
				<p class="muted mt-6 text-sm">No ledger data for this period.</p>
			{:else}
				<div class="mt-4 max-w-2xl space-y-5">
					<div class="rounded-md border dark:border-amber-500/40 border-amber-500/30 bg-amber-500/5 p-3 text-xs dark:text-amber-300 text-amber-700">
						Indirect method — derived from current-period GL movements. A subledger cash-flow
						classification engine (Phase 2) will replace this with a fully categorised view.
					</div>

					<!-- Operating -->
					<div>
						<h3 class="mb-2 border-b dark:border-white/15 border-slate-200 pb-1 text-sm font-semibold uppercase tracking-wider dark:text-white/70 text-slate-600">Operating Activities</h3>
						<table class="min-w-full text-sm">
							<tbody>
								<tr class="border-b dark:border-white/10 border-slate-100">
									<td class="px-2 py-2">Net income for the period</td>
									<td class="px-2 py-2 text-right tabular-nums">{fmt(netIncome)}</td>
								</tr>
								{#each expenseRows.filter(r => r.account_name.toLowerCase().includes('depreciation') || r.account_code.toLowerCase().includes('depr')) as r (r.trial_balance_row_id)}
									<tr class="border-b dark:border-white/10 border-slate-100">
										<td class="px-2 py-2 dark:text-white/70 text-slate-600">Add: Depreciation ({r.account_name})</td>
										<td class="px-2 py-2 text-right tabular-nums">{fmt(r.net)}</td>
									</tr>
								{/each}
								{#each liabilityRows as r (r.trial_balance_row_id)}
									<tr class="border-b dark:border-white/10 border-slate-100">
										<td class="px-2 py-2 dark:text-white/70 text-slate-600">Change in {r.account_name}</td>
										<td class="px-2 py-2 text-right tabular-nums">{fmt(Math.abs(r.net))}</td>
									</tr>
								{/each}
							</tbody>
							<tfoot>
								<tr class="border-t dark:border-white/20 border-slate-300 font-semibold">
									<td class="px-2 py-2">Net cash from operating activities</td>
									<td class="px-2 py-2 text-right tabular-nums">{fmt(netIncome + expenseRows.filter(r => r.account_name.toLowerCase().includes('depreciation') || r.account_code.toLowerCase().includes('depr')).reduce((s, r) => s + r.net, 0))}</td>
								</tr>
							</tfoot>
						</table>
					</div>

					<!-- Investing -->
					<div>
						<h3 class="mb-2 border-b dark:border-white/15 border-slate-200 pb-1 text-sm font-semibold uppercase tracking-wider dark:text-white/70 text-slate-600">Investing Activities</h3>
						<table class="min-w-full text-sm">
							<tbody>
								{#each assetRows.filter(r => r.account_name.toLowerCase().includes('ppe') || r.account_name.toLowerCase().includes('property') || r.account_name.toLowerCase().includes('equipment') || r.account_code.toLowerCase().includes('ppe')) as r (r.trial_balance_row_id)}
									<tr class="border-b dark:border-white/10 border-slate-100">
										<td class="px-2 py-2 dark:text-white/70 text-slate-600">Capital expenditure – {r.account_name}</td>
										<td class="px-2 py-2 text-right tabular-nums">{fmt(-r.net)}</td>
									</tr>
								{/each}
							</tbody>
							<tfoot>
								<tr class="border-t dark:border-white/20 border-slate-300 font-semibold">
									<td class="px-2 py-2">Net cash from investing activities</td>
									<td class="px-2 py-2 text-right tabular-nums">{fmt(-assetRows.filter(r => r.account_name.toLowerCase().includes('ppe') || r.account_name.toLowerCase().includes('property') || r.account_name.toLowerCase().includes('equipment') || r.account_code.toLowerCase().includes('ppe')).reduce((s, r) => s + r.net, 0))}</td>
								</tr>
							</tfoot>
						</table>
					</div>

					<!-- Financing -->
					<div>
						<h3 class="mb-2 border-b dark:border-white/15 border-slate-200 pb-1 text-sm font-semibold uppercase tracking-wider dark:text-white/70 text-slate-600">Financing Activities</h3>
						{#if equityRows.length === 0 && liabilityRows.filter(r => r.account_name.toLowerCase().includes('debt') || r.account_name.toLowerCase().includes('loan')).length === 0}
							<p class="muted text-sm px-2">No financing activity accounts identified in this period.</p>
						{:else}
							<table class="min-w-full text-sm">
								<tbody>
									{#each equityRows as r (r.trial_balance_row_id)}
										<tr class="border-b dark:border-white/10 border-slate-100">
											<td class="px-2 py-2 dark:text-white/70 text-slate-600">Capital contribution – {r.account_name}</td>
											<td class="px-2 py-2 text-right tabular-nums">{fmt(Math.abs(r.net))}</td>
										</tr>
									{/each}
								</tbody>
							</table>
						{/if}
					</div>

					<!-- Net cash position -->
					<div class="rounded-md border dark:border-white/15 border-slate-200 dark:bg-white/5 bg-slate-50 p-3">
						<div class="flex items-center justify-between text-sm">
							<span class="font-semibold">Net movement in cash (period)</span>
							<span class="tabular-nums font-semibold">{fmt(netCashMovement)}</span>
						</div>
						{#each cashRows as r (r.trial_balance_row_id)}
							<div class="mt-1 flex items-center justify-between text-xs dark:text-white/60 text-slate-500">
								<span>{r.account_name}</span>
								<span class="tabular-nums">{fmt(r.net)}</span>
							</div>
						{/each}
					</div>
				</div>
			{/if}
		{/if}

		<!-- ════════════════════════════════════════════════════════════
		     TAB: Statement of Changes in Equity (IAS 1)
		     ════════════════════════════════════════════════════════════ -->
		{#if activeTab === 'sce'}
			{#if enriched.length === 0}
				<p class="muted mt-6 text-sm">No ledger data for this period.</p>
			{:else}
				<div class="mt-4 max-w-2xl">
					<div class="mb-4 rounded-md border dark:border-amber-500/40 border-amber-500/30 bg-amber-500/5 p-3 text-xs dark:text-amber-300 text-amber-700">
						Opening balances require prior-period trial balance data. Phase 2 will add YTD consolidation endpoints.
						Current view shows period movement only.
					</div>

					<table class="min-w-full text-sm">
						<thead>
							<tr class="border-b dark:border-white/20 border-slate-300 text-xs font-semibold uppercase tracking-wider dark:text-white/60 text-slate-500">
								<th class="px-3 py-2 text-left">Component</th>
								<th class="px-3 py-2 text-right">Opening</th>
								<th class="px-3 py-2 text-right">Period movement</th>
								<th class="px-3 py-2 text-right">Closing</th>
							</tr>
						</thead>
						<tbody>
							{#each equityRows as r (r.trial_balance_row_id)}
								<tr class="border-b dark:border-white/10 border-slate-100">
									<td class="px-3 py-2">
										<span class="text-xs font-mono dark:text-white/50 text-slate-400">{r.account_code}</span>
										<span class="ml-2">{r.account_name}</span>
									</td>
									<td class="px-3 py-2 text-right tabular-nums dark:text-white/40 text-slate-400">—</td>
									<td class="px-3 py-2 text-right tabular-nums">{fmt(Math.abs(r.net))}</td>
									<td class="px-3 py-2 text-right tabular-nums font-semibold">{fmt(Math.abs(r.net))}</td>
								</tr>
							{/each}
							<tr class="border-b dark:border-white/10 border-slate-100 dark:text-emerald-400 text-emerald-600">
								<td class="px-3 py-2 italic">Net income for period</td>
								<td class="px-3 py-2 text-right tabular-nums dark:text-white/40 text-slate-400">—</td>
								<td class="px-3 py-2 text-right tabular-nums">{fmt(netIncome)}</td>
								<td class="px-3 py-2 text-right tabular-nums font-semibold">{fmt(netIncome)}</td>
							</tr>
						</tbody>
						<tfoot>
							<tr class="border-t-2 dark:border-white/25 border-slate-300 font-bold">
								<td class="px-3 py-3">Total Equity</td>
								<td class="px-3 py-3 text-right tabular-nums dark:text-white/40 text-slate-400">—</td>
								<td class="px-3 py-3 text-right tabular-nums">{fmt(totalEquity + netIncome)}</td>
								<td class="px-3 py-3 text-right tabular-nums">{fmt(closingEquity)}</td>
							</tr>
						</tfoot>
					</table>

					<!-- Equity KPIs -->
					<div class="mt-4 grid gap-3 md:grid-cols-3">
						<div class="rounded-md border dark:border-white/15 border-slate-200 dark:bg-white/5 bg-slate-100/60 p-3">
							<p class="muted text-xs">Contributed Capital</p>
							<p class="mt-1 text-lg font-semibold">{fmt(equityRows.filter(r => r.account_code.toLowerCase().includes('cap') || r.account_name.toLowerCase().includes('capital') || r.account_name.toLowerCase().includes('share')).reduce((s, r) => s + Math.abs(r.net), 0))}</p>
						</div>
						<div class="rounded-md border dark:border-white/15 border-slate-200 dark:bg-white/5 bg-slate-100/60 p-3">
							<p class="muted text-xs">Retained Earnings (period)</p>
							<p class="mt-1 text-lg font-semibold">{fmt(equityRows.filter(r => r.account_name.toLowerCase().includes('retained') || r.account_code.toLowerCase().includes('ret')).reduce((s, r) => s + Math.abs(r.net), 0))}</p>
						</div>
						<div class="rounded-md border dark:border-white/15 border-slate-200 dark:bg-white/5 bg-slate-100/60 p-3">
							<p class="muted text-xs">Period Net Income</p>
							<p class={`mt-1 text-lg font-semibold ${netIncome >= 0 ? 'dark:text-emerald-400 text-emerald-600' : 'dark:text-red-400 text-red-600'}`}>{fmt(netIncome)}</p>
						</div>
					</div>
				</div>
			{/if}
		{/if}

		<!-- ── Related reports nav ── -->
		<div class="mt-8 border-t dark:border-white/10 border-slate-200 pt-4 flex flex-wrap gap-2">
			<span class="muted self-center text-xs">Other R2R reports:</span>
			<a class="rounded-md border dark:border-white/35 border-slate-300 px-3 py-1.5 text-xs dark:text-white text-slate-900 dark:hover:bg-white/10 hover:bg-slate-500/10" href={resolve('/admin/r2r/ledger-entries')}>Ledger Entries</a>
			<a class="rounded-md border dark:border-white/35 border-slate-300 px-3 py-1.5 text-xs dark:text-white text-slate-900 dark:hover:bg-white/10 hover:bg-slate-500/10" href={resolve('/admin/r2r/tax-summary')}>Tax Summary</a>
			<a class="rounded-md border dark:border-white/35 border-slate-300 px-3 py-1.5 text-xs dark:text-white text-slate-900 dark:hover:bg-white/10 hover:bg-slate-500/10" href={resolve('/admin/r2r/vat-report')}>VAT Report</a>
			<a class="rounded-md border dark:border-white/35 border-slate-300 px-3 py-1.5 text-xs dark:text-white text-slate-900 dark:hover:bg-white/10 hover:bg-slate-500/10" href={resolve('/admin/r2r/withholding-tax')}>Withholding Tax</a>
		</div>
	{/if}
</section>
