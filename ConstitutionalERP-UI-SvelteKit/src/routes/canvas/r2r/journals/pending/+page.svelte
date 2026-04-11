<script lang="ts">
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import { isPendingJournal } from '$lib/api/dashboard';
	import { queryTable } from '$lib/api/query';
	import { actorStore } from '$lib/stores/actorStore';

	interface JournalRow {
		journal_id: string;
		memo?: string;
		state?: string;
	}

	let loading = false;
	let errorMessage = '';
	let pendingJournals: JournalRow[] = [];

	onMount(() => {
		const unsubscribeActor = actorStore.subscribe(() => {
			void loadPendingJournals();
		});

		void loadPendingJournals();

		return () => {
			unsubscribeActor();
		};
	});

	async function loadPendingJournals(): Promise<void> {
		loading = true;
		errorMessage = '';

		try {
			const result = await queryTable<JournalRow>('r2r_journal', $actorStore);
			pendingJournals = (result.data ?? []).filter(isPendingJournal);
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Unable to load pending journals.';
		} finally {
			loading = false;
		}
	}
</script>

<section class="glass-panel p-6">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<div>
			<h2 class="text-2xl font-semibold">Pending Journals</h2>
			<p class="muted mt-1 text-sm">Showing journals that are not yet posted or closed.</p>
		</div>
		<span class="rounded-full dark:bg-white/10 bg-slate-500/10 px-3 py-1 text-xs font-semibold dark:text-white text-slate-900">
			{pendingJournals.length} pending journals
		</span>
	</div>

	{#if loading}
		<p class="mt-4 text-sm">Loading pending journals...</p>
	{:else if errorMessage}
		<p class="mt-4 rounded-md border border-red-500/55 bg-red-500/10 p-3 text-sm text-red-200">{errorMessage}</p>
	{:else if pendingJournals.length === 0}
		<p class="mt-4 text-sm">No pending journals found.</p>
	{:else}
		<div class="mt-4 overflow-x-auto">
			<table class="min-w-full text-left text-sm">
				<thead>
					<tr class="border-b dark:border-white/15 border-slate-200 text-xs uppercase tracking-[0.15em] dark:text-white/70 text-slate-600">
						<th class="px-3 py-2">Journal</th>
						<th class="px-3 py-2">State</th>
						<th class="px-3 py-2">Memo</th>
						<th class="px-3 py-2">Process</th>
					</tr>
				</thead>
				<tbody>
					{#each pendingJournals as journal (journal.journal_id)}
						<tr class="border-b dark:border-white/10 border-slate-200 align-top">
							<td class="px-3 py-3 font-semibold">{journal.journal_id}</td>
							<td class="px-3 py-3">{journal.state ?? 'unknown'}</td>
							<td class="px-3 py-3">{journal.memo ?? 'n/a'}</td>
							<td class="px-3 py-3">
								<a class="rounded-md border dark:border-white/35 border-slate-300 px-2 py-1 text-xs dark:text-white text-slate-900" href={resolve(`/canvas/r2r_journal/${journal.journal_id}`)}>
									Open Process
								</a>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</section>
