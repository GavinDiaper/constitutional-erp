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
		ledger_id?: string;
		fiscal_period_id?: string;
		period_id?: string;
	}

	interface LedgerRow {
		ledger_id: string;
		name?: string;
	}

	interface AccountRow {
		account_id: string;
		ledger_id?: string | null;
	}

	let loading = false;
	let errorMessage = '';
	let entries: LedgerEntryRow[] = [];
	let journals: JournalRow[] = [];
	let ledgers: LedgerRow[] = [];
	let accounts: AccountRow[] = [];
	let offset = 0;
	let pageSize = 200;
	const maxRows = 5000;
	let accountFilter = '';
	let journalFilter = '';
	let periodFilter = '';
	let selectedLedgerId = '';

	$: queryPeriodId = $page.url.searchParams.get('periodId') ?? '';
	$: queryAccountId = $page.url.searchParams.get('accountId') ?? '';
	$: queryLedgerId = $page.url.searchParams.get('ledgerId') ?? '';

	onMount(() => {
		if (queryPeriodId) {
			periodFilter = queryPeriodId;
		}
		if (queryAccountId) {
			accountFilter = queryAccountId;
		}
		if (queryLedgerId) {
			selectedLedgerId = queryLedgerId;
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
		offset = 0;

		try {
			const [entryResult, journalResult, ledgerResult, accountResult] = await Promise.all([
				queryTable<LedgerEntryRow>('r2r_ledger_entry', $actorStore, maxRows, 0),
				queryTable<JournalRow>('r2r_journal', $actorStore, maxRows),
				queryTable<LedgerRow>('r2r_ledger', $actorStore, 500),
				queryTable<AccountRow>('r2r_account', $actorStore, maxRows)
			]);

			entries = entryResult.data ?? [];
			journals = journalResult.data ?? [];
			ledgers = ledgerResult.data ?? [];
			accounts = accountResult.data ?? [];
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

	function ledgerIdOf(entry: LedgerEntryRow): string {
		const journal = journals.find((candidate) => candidate.journal_id === entry.journal_id);
		if (journal?.ledger_id) {
			return String(journal.ledger_id);
		}

		const account = accounts.find((candidate) => candidate.account_id === entry.account_id);
		return String(account?.ledger_id ?? '');
	}

	function ledgerLabel(ledger: LedgerRow): string {
		return ledger.name ? `${ledger.name} (${ledger.ledger_id})` : ledger.ledger_id;
	}

	function match(value: string | undefined, filter: string): boolean {
		if (!filter.trim()) {
			return true;
		}
		return (value ?? '').toLowerCase().includes(filter.trim().toLowerCase());
	}

	function nextPage(): void {
		offset += pageSize;
	}

	function previousPage(): void {
		offset = Math.max(0, offset - pageSize);
	}

	function entryTimestamp(entry: LedgerEntryRow): number {
		const posting = Date.parse(String(entry.posting_date ?? ''));
		if (!Number.isNaN(posting)) {
			return posting;
		}

		const created = Date.parse(String(entry.created_at ?? ''));
		if (!Number.isNaN(created)) {
			return created;
		}

		return 0;
	}

	$: filteredEntries = [...entries]
		.sort((left, right) => entryTimestamp(right) - entryTimestamp(left))
		.filter((entry) => {
		const matchesAccount = match(entry.account_id, accountFilter);
		const matchesJournal = match(entry.journal_id, journalFilter);
		const matchesPeriod = !periodFilter || periodOf(entry) === periodFilter;
		const matchesLedger = !selectedLedgerId || ledgerIdOf(entry) === selectedLedgerId;
		return matchesAccount && matchesJournal && matchesPeriod && matchesLedger;
	});

	$: if (offset > 0 && offset >= filteredEntries.length) {
		offset = Math.max(0, Math.floor((Math.max(filteredEntries.length, 1) - 1) / pageSize) * pageSize);
	}

	$: pagedEntries = filteredEntries.slice(offset, offset + pageSize);

	$: sortedLedgers = [...ledgers].sort((left, right) => ledgerLabel(left).localeCompare(ledgerLabel(right)));
</script>

<section class="glass-panel p-6">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<div>
			<h2 class="text-2xl font-semibold">R2R Ledger Entries</h2>
			<p class="muted mt-2 text-sm">Inspect posted ledger lines and drill through to journal process pages.</p>
		</div>
		<button class="rounded-md border dark:border-white/35 border-slate-300 px-3 py-2 text-xs dark:text-white text-slate-900 dark:hover:bg-white/10 hover:bg-slate-500/10" on:click={loadEntries} disabled={loading}>
			{loading ? 'Refreshing...' : 'Refresh'}
		</button>
	</div>

	<div class="mt-4 grid gap-2 md:grid-cols-4">
		<select class="rounded-md border dark:border-white/25 border-slate-300 bg-[var(--input-bg)] px-3 py-2 text-sm" bind:value={selectedLedgerId}>
			<option value="">All ledgers</option>
			{#each sortedLedgers as ledger (ledger.ledger_id)}
				<option value={ledger.ledger_id}>{ledgerLabel(ledger)}</option>
			{/each}
		</select>
		<input class="rounded-md border dark:border-white/25 border-slate-300 bg-[var(--input-bg)] px-3 py-2 text-sm" placeholder="Filter by account" bind:value={accountFilter} />
		<input class="rounded-md border dark:border-white/25 border-slate-300 bg-[var(--input-bg)] px-3 py-2 text-sm" placeholder="Filter by journal" bind:value={journalFilter} />
		<input class="rounded-md border dark:border-white/25 border-slate-300 bg-[var(--input-bg)] px-3 py-2 text-sm" placeholder="Filter by period" bind:value={periodFilter} />
	</div>

	<div class="mt-3 flex flex-wrap items-center gap-2 text-xs">
		<button class="rounded-md border dark:border-white/35 border-slate-300 px-2 py-1 dark:text-white text-slate-900 dark:hover:bg-white/10 hover:bg-slate-500/10 disabled:opacity-40" on:click={previousPage} disabled={loading || offset === 0}>Previous</button>
		<button class="rounded-md border dark:border-white/35 border-slate-300 px-2 py-1 dark:text-white text-slate-900 dark:hover:bg-white/10 hover:bg-slate-500/10 disabled:opacity-40" on:click={nextPage} disabled={loading || offset + pageSize >= filteredEntries.length}>Next</button>
		<span class="muted">Offset {offset} | Page size {pageSize} | Filtered {filteredEntries.length} / Loaded {entries.length}</span>
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
					<tr class="border-b dark:border-white/15 border-slate-200 text-xs uppercase tracking-[0.15em] dark:text-white/70 text-slate-600">
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
					{#each pagedEntries as entry (entry.ledger_entry_id)}
						<tr class="border-b dark:border-white/10 border-slate-200">
							<td class="px-3 py-3 font-semibold">{entry.ledger_entry_id}</td>
							<td class="px-3 py-3 text-xs">{entry.journal_id ?? 'n/a'}</td>
							<td class="px-3 py-3 text-xs">{entry.account_id ?? 'n/a'}</td>
							<td class="px-3 py-3 text-xs">{formatDate(entry.posting_date ?? entry.created_at)}</td>
							<td class="px-3 py-3">{formatAmount(entry.debit_amount)}</td>
							<td class="px-3 py-3">{formatAmount(entry.credit_amount)}</td>
							<td class="px-3 py-3">
								<div class="flex flex-wrap gap-2">
									<a
										class="rounded-md border dark:border-white/35 border-slate-300 px-2 py-1 text-xs dark:text-white text-slate-900 dark:hover:bg-white/10 hover:bg-slate-500/10"
										href={resolve(`/admin/r2r/ledger-entries/${entry.ledger_entry_id}`)}
									>
										View Entry
									</a>
									{#if entry.journal_id}
										<a class="rounded-md border dark:border-white/35 border-slate-300 px-2 py-1 text-xs dark:text-white text-slate-900 dark:hover:bg-white/10 hover:bg-slate-500/10" href={resolve('/canvas/[entityType]/[entityId]', { entityType: 'r2r_journal', entityId: entry.journal_id })}>
											Open Journal
										</a>
									{/if}
								</div>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</section>
