<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { getSessionNavlog } from '$lib/api/navlog';
	import { getSessionTranscript } from '$lib/api/transcript';
	import { actorStore } from '$lib/stores/actorStore';

	type SessionTab = 'navlog' | 'transcript' | 'summary';

	interface NavlogEntry {
		navlog_id?: string;
		timestamp?: string;
		entry_type?: string;
		action?: string;
		entity_type?: string;
		entity_id?: string;
		actor_id?: string;
		simulation_outcome?: string;
		execution_result?: string;
		error_message?: string;
	}

	interface TranscriptEntry {
		transcript_id?: string;
		timestamp?: string;
		command?: string;
		command_type?: string;
		status?: string;
		output_text?: string;
		error_message?: string;
		execution_time_ms?: number;
	}

	let activeTab: SessionTab = 'navlog';
	let loading = false;
	let errorMessage = '';
	let navlogEntries: NavlogEntry[] = [];
	let transcriptEntries: TranscriptEntry[] = [];
	let navlogEntryType = '';
	let transcriptStatus = '';
	let transcriptCommandType = '';

	$: sessionId = $page.params.sessionId;

	onMount(() => {
		const unsubscribeActor = actorStore.subscribe(() => {
			void loadSessionData();
		});

		const unsubscribePage = page.subscribe(() => {
			void loadSessionData();
		});

		void loadSessionData();

		return () => {
			unsubscribeActor();
			unsubscribePage();
		};
	});

	function toArray(payload: unknown): unknown[] {
		if (!payload || typeof payload !== 'object') {
			return [];
		}

		const record = payload as Record<string, unknown>;
		if (Array.isArray(record.data)) {
			return record.data;
		}
		if (Array.isArray(record.entries)) {
			return record.entries;
		}
		return [];
	}

	async function loadSessionData(): Promise<void> {
		if (!sessionId) {
			return;
		}

		loading = true;
		errorMessage = '';

		try {
			const [navlogResponse, transcriptResponse] = await Promise.all([
				getSessionNavlog(sessionId, $actorStore, {
					entryType: navlogEntryType || undefined,
					limit: 250
				}) as Promise<unknown>,
				getSessionTranscript(sessionId, $actorStore, {
					status: transcriptStatus || undefined,
					commandType: transcriptCommandType || undefined,
					limit: 250
				}) as Promise<unknown>
			]);

			navlogEntries = toArray(navlogResponse) as NavlogEntry[];
			transcriptEntries = toArray(transcriptResponse) as TranscriptEntry[];
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Unable to load session details.';
		} finally {
			loading = false;
		}
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

	function processTarget(entry: NavlogEntry): { entityType: string; entityId: string } | null {
		if (!entry.entity_type || !entry.entity_id) {
			return null;
		}

		return {
			entityType: entry.entity_type,
			entityId: entry.entity_id
		};
	}

	$: entryTypeOptions = Array.from(new Set(navlogEntries.map((row) => row.entry_type).filter((value): value is string => typeof value === 'string' && value.length > 0))).sort((a, b) =>
		a.localeCompare(b)
	);
	$: transcriptStatusOptions = Array.from(new Set(transcriptEntries.map((row) => row.status).filter((value): value is string => typeof value === 'string' && value.length > 0))).sort((a, b) =>
		a.localeCompare(b)
	);
	$: transcriptTypeOptions = Array.from(new Set(transcriptEntries.map((row) => row.command_type).filter((value): value is string => typeof value === 'string' && value.length > 0))).sort((a, b) =>
		a.localeCompare(b)
	);

	$: successCount = transcriptEntries.filter((row) => (row.status ?? '').toLowerCase() === 'success').length;
	$: failureCount = transcriptEntries.filter((row) => (row.status ?? '').toLowerCase() === 'error').length;
	$: executionCount = navlogEntries.filter((row) => (row.entry_type ?? '').toLowerCase() === 'execution').length;
</script>

<section class="glass-panel p-6">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<div>
			<h2 class="text-2xl font-semibold">Session {sessionId}</h2>
			<p class="muted mt-2 text-sm">Inspect navlog and transcript entries for this session.</p>
		</div>
		<button class="rounded-md border border-white/35 px-3 py-2 text-xs text-white hover:bg-white/10" on:click={loadSessionData} disabled={loading}>
			{loading ? 'Refreshing...' : 'Refresh'}
		</button>
	</div>

	<div class="mt-4 flex flex-wrap gap-2 text-xs">
		<button class={`rounded-md border px-3 py-1 ${activeTab === 'navlog' ? 'border-white bg-white/20 text-white' : 'border-white/25 text-white/80 hover:bg-white/10'}`} on:click={() => (activeTab = 'navlog')}>
			Navlog
		</button>
		<button class={`rounded-md border px-3 py-1 ${activeTab === 'transcript' ? 'border-white bg-white/20 text-white' : 'border-white/25 text-white/80 hover:bg-white/10'}`} on:click={() => (activeTab = 'transcript')}>
			Transcript
		</button>
		<button class={`rounded-md border px-3 py-1 ${activeTab === 'summary' ? 'border-white bg-white/20 text-white' : 'border-white/25 text-white/80 hover:bg-white/10'}`} on:click={() => (activeTab = 'summary')}>
			Summary
		</button>
	</div>

	{#if errorMessage}
		<p class="mt-4 rounded-md border border-red-500/55 bg-red-500/10 p-3 text-sm text-red-200">{errorMessage}</p>
	{:else if loading}
		<p class="mt-4 text-sm">Loading session data...</p>
	{:else if activeTab === 'navlog'}
		<div class="mt-4 space-y-3">
			<div class="grid gap-2 md:grid-cols-3">
				<select class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" bind:value={navlogEntryType} on:change={loadSessionData}>
					<option value="">All entry types</option>
					{#each entryTypeOptions as option (option)}
						<option value={option}>{option}</option>
					{/each}
				</select>
			</div>

			{#if navlogEntries.length === 0}
				<p class="text-sm">No navlog entries found for this session.</p>
			{:else}
				<ul class="space-y-2 text-sm">
					{#each navlogEntries as entry, index (`${entry.navlog_id ?? 'row'}-${index}`)}
						{@const target = processTarget(entry)}
						<li class="rounded-md border border-white/15 bg-white/5 p-3">
							<div class="flex flex-wrap items-center justify-between gap-2">
								<p class="font-semibold">{entry.entry_type ?? 'entry'}</p>
								<span class="muted text-xs">{formatDate(entry.timestamp)}</span>
							</div>
							<p class="muted mt-1 text-xs">Action: {entry.action ?? 'n/a'} | Actor: {entry.actor_id ?? 'n/a'}</p>
							{#if entry.simulation_outcome || entry.execution_result || entry.error_message}
								<p class="mt-2 text-xs text-white/85">{entry.execution_result ?? entry.simulation_outcome ?? entry.error_message}</p>
							{/if}
							{#if target}
								<a
									class="mt-2 inline-block rounded-md border border-white/35 px-2 py-1 text-xs text-white hover:bg-white/10"
									href={resolve('/canvas/[entityType]/[entityId]', target)}
								>
									Open Related Process
								</a>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	{:else if activeTab === 'transcript'}
		<div class="mt-4 space-y-3">
			<div class="grid gap-2 md:grid-cols-3">
				<select class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" bind:value={transcriptCommandType} on:change={loadSessionData}>
					<option value="">All command types</option>
					{#each transcriptTypeOptions as option (option)}
						<option value={option}>{option}</option>
					{/each}
				</select>
				<select class="rounded-md border border-white/25 bg-[#112946] px-3 py-2 text-sm" bind:value={transcriptStatus} on:change={loadSessionData}>
					<option value="">All statuses</option>
					{#each transcriptStatusOptions as option (option)}
						<option value={option}>{option}</option>
					{/each}
				</select>
			</div>

			{#if transcriptEntries.length === 0}
				<p class="text-sm">No transcript entries found for this session.</p>
			{:else}
				<ul class="space-y-2 text-sm">
					{#each transcriptEntries as entry, index (`${entry.transcript_id ?? 'row'}-${index}`)}
						<li class="rounded-md border border-white/15 bg-white/5 p-3">
							<div class="flex flex-wrap items-center justify-between gap-2">
								<p class="font-semibold">{entry.command_type ?? 'command'}</p>
								<span class="muted text-xs">{formatDate(entry.timestamp)}</span>
							</div>
							<p class="mt-1 text-xs">{entry.command ?? 'n/a'}</p>
							<p class="muted mt-1 text-xs">Status: {entry.status ?? 'n/a'} {#if entry.execution_time_ms} | {entry.execution_time_ms}ms{/if}</p>
							{#if entry.output_text || entry.error_message}
								<p class="mt-2 text-xs text-white/85">{entry.output_text ?? entry.error_message}</p>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	{:else}
		<div class="mt-4 grid gap-3 md:grid-cols-3">
			<div class="rounded-md border border-white/15 bg-white/5 p-4">
				<p class="muted text-xs">Navlog entries</p>
				<p class="mt-2 text-2xl font-semibold">{navlogEntries.length}</p>
			</div>
			<div class="rounded-md border border-white/15 bg-white/5 p-4">
				<p class="muted text-xs">Execution entries</p>
				<p class="mt-2 text-2xl font-semibold">{executionCount}</p>
			</div>
			<div class="rounded-md border border-white/15 bg-white/5 p-4">
				<p class="muted text-xs">Transcript success / error</p>
				<p class="mt-2 text-2xl font-semibold">{successCount} / {failureCount}</p>
			</div>
		</div>
	{/if}
</section>
