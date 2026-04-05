<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { queryTable } from '$lib/api/query';
	import { actorStore } from '$lib/stores/actorStore';

	interface LedgerEntryRow {
		ledger_entry_id: string;
		journal_id?: string;
		account_id?: string;
		posting_date?: string;
		debit_amount?: number | string;
		credit_amount?: number | string;
		memo?: string;
		created_at?: string;
	}

	interface JournalRow {
		journal_id: string;
		fiscal_period_id?: string;
		period_id?: string;
	}

	let loading = false;
	let errorMessage = '';
	let entries: LedgerEntryRow[] = [];
	let journals: JournalRow[] = [];
	let offset = 0;
	let pageSize = 200;
	let accountFilter = '';
	let journalFilter = '';
	let periodFilter = '';

	$: queryPeriodId = $page.url.searchParams.get('periodId') ?? '';
	$: queryAccountId = $page.url.searchParams.get('accountId') ?? '';

	onMount(() => {
		if (queryPeriodId) {
			periodFilter = queryPeriodId;
		}
		if (queryAccountId) {
			accountFilter = queryAccountId;
		}

		const unsubscribeActor = actorStore.subscribe(() => {
			void loadEntries();
		});

		void loadEntries();

		return () => {
			unsubscribeActor();
		};
	});

	async function loadEntries(): Promise<void> {
		loading = true;
		errorMessage = '';

		try {
			const [entryResult, journalResult] = await Promise.all([
				queryTable<LedgerEntryRow>('r2r_ledger_entry', $actorStore, pageSize, offset),
				queryTable<JournalRow>('r2r_journal', $actorStore, 500)
			]);

			entries = entryResult.data ?? [];
			journals = journalResult.data ?? [];
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Unable to load ledger entries.';
		} finally {
			loading = false;
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

	function formatAmount(value: unknown): string {
		return toNumber(value).toLocaleString(undefined, {
			minimumFractionDigits: 2,
			maximumFractionDigits: 2
		});
	}

	function formatDate(value: string | undefined): string {
		if (!value) {
			return 'n/a';
		}
		const parsed = Date.parse(value);
		if (Number.isNaN(parsed)) {
			return value;
		}
		return new Date(parsed).toLocaleString();
	}

	function periodOf(entry: LedgerEntryRow): string {
		const journal = journals.find((candidate) => candidate.journal_id === entry.journal_id);
		return String(journal?.fiscal_period_id ?? journal?.period_id ?? '');
	}

	function match(value: string | undefined, filter: string): boolean {
		if (!filter.trim()) {
			return true;
		}
		return (value ?? '').toLowerCase().includes(filter.trim().toLowerCase());
	}

	function nextPage(): void {
		offset += pageSize;
		void loadEntries();
	}

	function previousPage(): void {
		offset = Math.max(0, offset - pageSize);
		void loadEntries();
	}

	$: filteredEntries = entries.filter((entry) => {
		const matchesAccount = match(entry.account_id, accountFilter);
		const matchesJournal = match(entry.journal_id, journalFilter);
		const matchesPeriod = !periodFilter || periodOf(entry) === periodFilter;
		return matchesAccount && matchesJournal && matchesPeriod;
	});
</script>

<section class="glass-panel p-6">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<div>
			<h2 class="text-2xl font-semibold">R2R Ledger Entries</h2>
			<p class="muted mt-2 text-sm">Inspect posted ledger lines and drill through to journal process pages.</p>
		</div>
		<button class="rounded-md border border-white/35 px-3 py-2 text-xs text-white hover:bg-white/10" on:click={loadEntries} disabled={loading}>
			{loading ? 'Refreshing...' : 'Refresh'}
		</button>
	</div>

	<div class="mt-4 grid gap-2 md:grid-cols-4">
		<input class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" placeholder="Filter by account" bind:value={accountFilter} />
		<input class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" placeholder="Filter by journal" bind:value={journalFilter} />
		<input class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" placeholder="Filter by period" bind:value={periodFilter} />
	</div>

	<div class="mt-3 flex flex-wrap items-center gap-2 text-xs">
		<button class="rounded-md border border-white/35 px-2 py-1 text-white hover:bg-white/10 disabled:opacity-40" on:click={previousPage} disabled={loading || offset === 0}>Previous</button>
		<button class="rounded-md border border-white/35 px-2 py-1 text-white hover:bg-white/10 disabled:opacity-40" on:click={nextPage} disabled={loading}>Next</button>
		<span class="muted">Offset {offset} | Page size {pageSize}</span>
	</div>

	{#if errorMessage}
		<p class="mt-4 rounded-md border border-red-500/55 bg-red-500/10 p-3 text-sm text-red-200">{errorMessage}</p>
	{:else if loading}
		<p class="mt-4 text-sm">Loading ledger entries...</p>
	{:else if filteredEntries.length === 0}
		<p class="mt-4 text-sm">No ledger entries match the selected filters.</p>
	{:else}
		<div class="mt-4 overflow-x-auto">
			<table class="min-w-full text-left text-sm">
				<thead>
					<tr class="border-b border-white/15 text-xs uppercase tracking-[0.15em] text-white/70">
						<th class="px-3 py-2">Ledger Entry</th>
						<th class="px-3 py-2">Journal</th>
						<th class="px-3 py-2">Account</th>
						<th class="px-3 py-2">Posting Date</th>
						<th class="px-3 py-2">Debit</th>
						<th class="px-3 py-2">Credit</th>
						<th class="px-3 py-2">Action</th>
					</tr>
				</thead>
				<tbody>
					{#each filteredEntries as entry (entry.ledger_entry_id)}
						<tr class="border-b border-white/10">
							<td class="px-3 py-3 font-semibold">{entry.ledger_entry_id}</td>
							<td class="px-3 py-3 text-xs">{entry.journal_id ?? 'n/a'}</td>
							<td class="px-3 py-3 text-xs">{entry.account_id ?? 'n/a'}</td>
							<td class="px-3 py-3 text-xs">{formatDate(entry.posting_date ?? entry.created_at)}</td>
							<td class="px-3 py-3">{formatAmount(entry.debit_amount)}</td>
							<td class="px-3 py-3">{formatAmount(entry.credit_amount)}</td>
							<td class="px-3 py-3">
								{#if entry.journal_id}
									<a class="rounded-md border border-white/35 px-2 py-1 text-xs text-white hover:bg-white/10" href={resolve(`/canvas/r2r_journal/${entry.journal_id}`)}>
										Open Journal
									</a>
								{:else}
									<span class="muted text-xs">No journal link</span>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</section>
