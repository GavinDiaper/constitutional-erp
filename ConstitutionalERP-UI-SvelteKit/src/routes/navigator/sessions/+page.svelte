<script lang="ts">
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import { getSessions } from '$lib/api/navlog';
	import { actorStore } from '$lib/stores/actorStore';

	interface SessionRow {
		session_id: string;
		actor_id?: string;
		started_at?: string;
		ended_at?: string | null;
		context_json?: unknown;
	}

	let loading = false;
	let errorMessage = '';
	let sessions: SessionRow[] = [];
	let textFilter = '';

	onMount(() => {
		const unsubscribeActor = actorStore.subscribe(() => {
			void loadSessions();
		});

		void loadSessions();

		return () => {
			unsubscribeActor();
		};
	});

	async function loadSessions(): Promise<void> {
		loading = true;
		errorMessage = '';

		try {
			const response = await getSessions($actorStore);
			sessions = (response.data as SessionRow[] | undefined) ?? [];
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Unable to load sessions.';
		} finally {
			loading = false;
		}
	}

	function formatDate(value: string | undefined | null): string {
		if (!value) {
			return 'n/a';
		}
		const parsed = Date.parse(value);
		if (Number.isNaN(parsed)) {
			return value;
		}
		return new Date(parsed).toLocaleString();
	}

	function match(value: string | undefined, filter: string): boolean {
		const normalized = filter.trim().toLowerCase();
		if (!normalized) {
			return true;
		}
		return (value ?? '').toLowerCase().includes(normalized);
	}

	$: visibleSessions = sessions.filter(
		(row) =>
			match(row.session_id, textFilter) ||
			match(row.actor_id, textFilter) ||
			match(row.started_at ?? undefined, textFilter)
	);
</script>

<section class="glass-panel p-6">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<div>
			<h2 class="text-2xl font-semibold">Navigator Sessions</h2>
			<p class="muted mt-2 text-sm">Browse sessions and open navlog/transcript details.</p>
		</div>
		<button class="rounded-md border border-white/35 px-3 py-2 text-xs text-white hover:bg-white/10" on:click={loadSessions} disabled={loading}>
			{loading ? 'Refreshing...' : 'Refresh'}
		</button>
	</div>

	<div class="mt-4">
		<input class="w-full max-w-md rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" placeholder="Filter by session or actor" bind:value={textFilter} />
	</div>

	{#if errorMessage}
		<p class="mt-4 rounded-md border border-red-500/55 bg-red-500/10 p-3 text-sm text-red-200">{errorMessage}</p>
	{:else if loading}
		<p class="mt-4 text-sm">Loading sessions...</p>
	{:else if visibleSessions.length === 0}
		<p class="mt-4 text-sm">No sessions found.</p>
	{:else}
		<div class="mt-4 overflow-x-auto">
			<table class="min-w-full text-left text-sm">
				<thead>
					<tr class="border-b border-white/15 text-xs uppercase tracking-[0.15em] text-white/70">
						<th class="px-3 py-2">Session</th>
						<th class="px-3 py-2">Actor</th>
						<th class="px-3 py-2">Started</th>
						<th class="px-3 py-2">Ended</th>
						<th class="px-3 py-2">Detail</th>
					</tr>
				</thead>
				<tbody>
					{#each visibleSessions as session (session.session_id)}
						<tr class="border-b border-white/10">
							<td class="px-3 py-3 font-semibold">{session.session_id}</td>
							<td class="px-3 py-3 text-xs">{session.actor_id ?? 'n/a'}</td>
							<td class="px-3 py-3 text-xs">{formatDate(session.started_at)}</td>
							<td class="px-3 py-3 text-xs">{formatDate(session.ended_at)}</td>
							<td class="px-3 py-3">
								<a class="rounded-md border border-white/35 px-2 py-1 text-xs text-white hover:bg-white/10" href={resolve(`/navigator/sessions/${session.session_id}`)}>
									Open Session
								</a>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</section>
