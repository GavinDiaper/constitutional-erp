<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { queryRow, queryTable } from '$lib/api/query';
	import { actorStore } from '$lib/stores/actorStore';

	interface LedgerEntryRow {
		ledger_entry_id: string;
		journal_id: string;
		account_id: string;
		posting_date?: string;
		debit_amount?: number | string;
		credit_amount?: number | string;
		created_at?: string;
	}

	interface JournalRow {
		journal_id: string;
		fiscal_period_id?: string;
		description?: string;
		state?: string;
		version?: number;
		created_at?: string;
		updated_at?: string;
	}

	interface FiscalPeriodRow {
		fiscal_period_id: string;
		fiscal_year_id?: string;
		period_number?: number;
		state?: string;
		start_date?: string;
		end_date?: string;
	}

	interface AccountRow {
		account_id: string;
		account_code?: string;
		account_name?: string;
		account_type?: string;
	}

	interface JournalLineRow {
		journal_line_id: string;
		journal_id: string;
		account_id?: string;
		debit_amount?: number | string;
		credit_amount?: number | string;
		memo?: string;
		created_at?: string;
	}

	let loading = false;
	let errorMessage = '';
	let entry: LedgerEntryRow | null = null;
	let journal: JournalRow | null = null;
	let account: AccountRow | null = null;
	let fiscalPeriod: FiscalPeriodRow | null = null;
	let journalLines: JournalLineRow[] = [];
	let relatedEntries: LedgerEntryRow[] = [];

	$: entryId = $page.params.entryId;

	onMount(() => {
		const unsubscribeActor = actorStore.subscribe(() => {
			void loadData();
		});

		const unsubscribePage = page.subscribe(() => {
			void loadData();
		});

		void loadData();

		return () => {
			unsubscribeActor();
			unsubscribePage();
		};
	});

	async function loadData(): Promise<void> {
		if (!entryId) {
			return;
		}

		loading = true;
		errorMessage = '';
		entry = null;
		journal = null;
		account = null;
		fiscalPeriod = null;
		journalLines = [];
		relatedEntries = [];

		try {
			const entryResult = await queryRow<LedgerEntryRow>('r2r_ledger_entry', entryId, $actorStore);
			entry = entryResult.data;

			if (entry.journal_id) {
				const [journalResult, journalLinesResult, relatedEntriesResult] = await Promise.allSettled([
					queryRow<JournalRow>('r2r_journal', entry.journal_id, $actorStore),
					queryTable<JournalLineRow>('r2r_journal_line', $actorStore, 1000),
					queryTable<LedgerEntryRow>('r2r_ledger_entry', $actorStore, 1000)
				]);

				journal = journalResult.status === 'fulfilled' ? journalResult.value.data : null;
				journalLines =
					journalLinesResult.status === 'fulfilled'
						? (journalLinesResult.value.data ?? []).filter((line) => line.journal_id === entry?.journal_id)
						: [];
				relatedEntries =
					relatedEntriesResult.status === 'fulfilled'
						? (relatedEntriesResult.value.data ?? []).filter(
								(candidate) =>
									candidate.journal_id === entry?.journal_id &&
									candidate.ledger_entry_id !== entry?.ledger_entry_id
							)
						: [];

				const fiscalPeriodId = journal && typeof journal.fiscal_period_id === 'string' ? journal.fiscal_period_id : '';
				if (fiscalPeriodId) {
					try {
						const periodResult = await queryRow<FiscalPeriodRow>('r2r_fiscal_period', fiscalPeriodId, $actorStore);
						fiscalPeriod = periodResult.data;
					} catch {
						fiscalPeriod = null;
					}
				}
			}

			if (entry.account_id) {
				try {
					const accountResult = await queryRow<AccountRow>('r2r_account', entry.account_id, $actorStore);
					account = accountResult.data;
				} catch {
					account = null;
				}
			}
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Unable to load ledger entry detail.';
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

	$: journalDebit = journalLines.reduce((sum, row) => sum + toNumber(row.debit_amount), 0);
	$: journalCredit = journalLines.reduce((sum, row) => sum + toNumber(row.credit_amount), 0);
	$: journalBalanced = Math.round(journalDebit * 100) === Math.round(journalCredit * 100);
</script>

<section class="glass-panel p-6">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<div>
			<h2 class="text-2xl font-semibold">Ledger Entry Detail</h2>
			<p class="muted mt-2 text-sm">Entry-level accounting context across journal, account, and period views.</p>
		</div>
		<button class="rounded-md border border-white/35 px-3 py-2 text-xs text-white hover:bg-white/10" on:click={loadData} disabled={loading}>
			{loading ? 'Refreshing...' : 'Refresh'}
		</button>
	</div>

	{#if errorMessage}
		<p class="mt-4 rounded-md border border-red-500/55 bg-red-500/10 p-3 text-sm text-red-200">{errorMessage}</p>
	{:else if loading}
		<p class="mt-4 text-sm">Loading ledger entry detail...</p>
	{:else if !entry}
		<p class="mt-4 text-sm">Ledger entry not found.</p>
	{:else}
		<div class="mt-4 flex flex-wrap gap-2 text-xs">
			<a class="rounded-md border border-white/35 px-2 py-1 text-white hover:bg-white/10" href={resolve('/admin/r2r/ledger-entries')}>
				Back To Ledger Entries
			</a>
			{#if entry.journal_id}
				<a class="rounded-md border border-white/35 px-2 py-1 text-white hover:bg-white/10" href={resolve('/canvas/[entityType]/[entityId]', { entityType: 'r2r_journal', entityId: entry.journal_id })}>
					Open Journal Process
				</a>
			{/if}
			{#if fiscalPeriod?.fiscal_period_id}
				<a class="rounded-md border border-white/35 px-2 py-1 text-white hover:bg-white/10" href={resolve('/admin/r2r/trial-balance')}>
					Open Trial Balance
				</a>
			{/if}
			{#if entry.account_id && fiscalPeriod?.fiscal_period_id}
				<a
					class="rounded-md border border-white/35 px-2 py-1 text-white hover:bg-white/10"
					href={resolve(`/admin/r2r/ledger-entries?periodId=${encodeURIComponent(fiscalPeriod.fiscal_period_id)}&accountId=${encodeURIComponent(entry.account_id)}`)}
				>
					Account In Period
				</a>
			{/if}
		</div>

		<div class="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
			<div class="rounded-md border border-white/15 bg-white/5 p-4">
				<p class="muted text-xs">Entry ID</p>
				<p class="mt-2 text-sm font-semibold break-all">{entry.ledger_entry_id}</p>
			</div>
			<div class="rounded-md border border-white/15 bg-white/5 p-4">
				<p class="muted text-xs">Account</p>
				<p class="mt-2 text-sm font-semibold">{entry.account_id}</p>
				<p class="muted text-xs">{account?.account_code ?? 'n/a'} {account?.account_name ?? ''}</p>
			</div>
			<div class="rounded-md border border-white/15 bg-white/5 p-4">
				<p class="muted text-xs">Journal</p>
				<p class="mt-2 text-sm font-semibold">{entry.journal_id}</p>
				<p class="muted text-xs">{journal?.state ?? 'n/a'} v{journal?.version ?? 'n/a'}</p>
			</div>
			<div class="rounded-md border border-white/15 bg-white/5 p-4">
				<p class="muted text-xs">Period</p>
				<p class="mt-2 text-sm font-semibold">{journal?.fiscal_period_id ?? 'n/a'}</p>
				<p class="muted text-xs">{fiscalPeriod?.period_number ? `P${fiscalPeriod.period_number}` : ''} {fiscalPeriod?.state ?? ''}</p>
			</div>
			<div class="rounded-md border border-white/15 bg-white/5 p-4">
				<p class="muted text-xs">Posting Date</p>
				<p class="mt-2 text-sm font-semibold">{formatDate(entry.posting_date ?? entry.created_at)}</p>
			</div>
			<div class="rounded-md border border-white/15 bg-white/5 p-4">
				<p class="muted text-xs">Entry Debit</p>
				<p class="mt-2 text-sm font-semibold">{formatAmount(entry.debit_amount)}</p>
			</div>
			<div class="rounded-md border border-white/15 bg-white/5 p-4">
				<p class="muted text-xs">Entry Credit</p>
				<p class="mt-2 text-sm font-semibold">{formatAmount(entry.credit_amount)}</p>
			</div>
			<div class={`rounded-md border p-4 ${journalBalanced ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-red-500/50 bg-red-500/10'}`}>
				<p class="muted text-xs">Journal Parity</p>
				<p class="mt-2 text-sm font-semibold">{journalBalanced ? 'Balanced' : 'Out Of Balance'}</p>
				<p class="muted text-xs">{formatAmount(journalDebit)} / {formatAmount(journalCredit)}</p>
			</div>
		</div>

		<div class="mt-5 grid gap-4 xl:grid-cols-2">
			<div class="rounded-md border border-white/15 bg-white/5 p-4">
				<h3 class="text-sm font-semibold uppercase tracking-[0.1em] text-white/85">Journal Lines</h3>
				{#if journalLines.length === 0}
					<p class="mt-3 text-sm">No journal lines found for this journal.</p>
				{:else}
					<div class="mt-3 overflow-x-auto">
						<table class="min-w-full text-left text-xs">
							<thead>
								<tr class="border-b border-white/10 text-white/70">
									<th class="px-2 py-2">Line</th>
									<th class="px-2 py-2">Account</th>
									<th class="px-2 py-2">Debit</th>
									<th class="px-2 py-2">Credit</th>
								</tr>
							</thead>
							<tbody>
								{#each journalLines as line (line.journal_line_id)}
									<tr class="border-b border-white/10">
										<td class="px-2 py-2">{line.journal_line_id}</td>
										<td class="px-2 py-2">{line.account_id ?? 'n/a'}</td>
										<td class="px-2 py-2">{formatAmount(line.debit_amount)}</td>
										<td class="px-2 py-2">{formatAmount(line.credit_amount)}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
			</div>

			<div class="rounded-md border border-white/15 bg-white/5 p-4">
				<h3 class="text-sm font-semibold uppercase tracking-[0.1em] text-white/85">Related Ledger Entries</h3>
				{#if relatedEntries.length === 0}
					<p class="mt-3 text-sm">No additional ledger entries found for this journal.</p>
				{:else}
					<ul class="mt-3 space-y-2 text-sm">
						{#each relatedEntries as related (related.ledger_entry_id)}
							<li class="rounded border border-white/10 p-2">
								<div class="flex flex-wrap items-center justify-between gap-2">
									<p class="font-semibold">{related.ledger_entry_id}</p>
									<a
										class="rounded-md border border-white/35 px-2 py-1 text-xs text-white hover:bg-white/10"
										href={resolve(`/admin/r2r/ledger-entries/${related.ledger_entry_id}`)}
									>
										Open
									</a>
								</div>
								<p class="muted text-xs">Account {related.account_id} | Debit {formatAmount(related.debit_amount)} | Credit {formatAmount(related.credit_amount)}</p>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		</div>
	{/if}
</section>
