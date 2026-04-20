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
		arguments_json?: string;
		output_json?: string;
		output_text?: string;
		context_json?: string;
		actor_id?: string;
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

	function lower(value: string | undefined): string {
		return (value ?? '').trim().toLowerCase();
	}

	function formatTextBlock(value: string | undefined): string {
		const source = (value ?? '').trim();
		if (!source) {
			return '';
		}

		const parsed = tryParseJson(source);
		if (parsed !== null) {
			return JSON.stringify(parsed, null, 2);
		}

		return source;
	}

	function formatJsonColumn(value: string | undefined): string {
		const source = (value ?? '').trim();
		if (!source) {
			return '';
		}

		const parsed = tryParseJson(source);
		if (parsed !== null) {
			return JSON.stringify(parsed, null, 2);
		}

		return source;
	}

	function tryParseJson(value: string): unknown | null {
		try {
			return JSON.parse(value);
		} catch {
			return null;
		}
	}

	function statusClass(status: string | undefined): string {
		switch (lower(status)) {
			case 'success':
				return 'border-emerald-500/50 bg-emerald-500/10 text-emerald-100';
			case 'error':
				return 'border-red-500/50 bg-red-500/10 text-red-100';
			case 'partial':
				return 'border-amber-500/50 bg-amber-500/10 text-amber-100';
			default:
				return 'dark:border-white/25 border-slate-300 dark:bg-white/10 bg-slate-500/10 dark:text-white/85 text-slate-700';
		}
	}

	function formatMs(value: number | undefined): string {
		if (typeof value !== 'number' || !Number.isFinite(value)) {
			return 'n/a';
		}
		return `${Math.round(value)}ms`;
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

	$: successCount = transcriptEntries.filter((row) => lower(row.status) === 'success').length;
	$: failureCount = transcriptEntries.filter((row) => lower(row.status) === 'error').length;
	$: partialCount = transcriptEntries.filter((row) => lower(row.status) === 'partial').length;
	$: proposalCount = navlogEntries.filter((row) => lower(row.entry_type) === 'proposal').length;
	$: simulationCount = navlogEntries.filter((row) => lower(row.entry_type) === 'simulation').length;
	$: decisionCount = navlogEntries.filter((row) => lower(row.entry_type) === 'decision').length;
	$: executionCount = navlogEntries.filter((row) => lower(row.entry_type) === 'execution').length;
	$: completionRate = transcriptEntries.length > 0 ? (successCount / transcriptEntries.length) * 100 : 0;

	$: executionTimes = transcriptEntries
		.map((row) => row.execution_time_ms)
		.filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0)
		.sort((left, right) => left - right);
	$: avgExecutionMs =
		executionTimes.length > 0
			? Math.round(executionTimes.reduce((sum, value) => sum + value, 0) / executionTimes.length)
			: 0;
	$: p95ExecutionMs =
		executionTimes.length > 0
			? executionTimes[Math.max(0, Math.ceil(executionTimes.length * 0.95) - 1)]
			: 0;
	$: maxExecutionMs = executionTimes.length > 0 ? executionTimes[executionTimes.length - 1] : 0;

	$: timelineStart =
		[...navlogEntries.map((row) => row.timestamp), ...transcriptEntries.map((row) => row.timestamp)]
			.filter((value): value is string => typeof value === 'string' && !Number.isNaN(Date.parse(value)))
			.sort((left, right) => Date.parse(left) - Date.parse(right))[0] ?? '';
	$: timelineValues = [...navlogEntries.map((row) => row.timestamp), ...transcriptEntries.map((row) => row.timestamp)]
		.filter((value): value is string => typeof value === 'string' && !Number.isNaN(Date.parse(value)))
		.sort((left, right) => Date.parse(left) - Date.parse(right));
	$: timelineEnd = timelineValues.length > 0 ? timelineValues[timelineValues.length - 1] : '';
	$: timelineMinutes =
		timelineStart && timelineEnd
			? Math.max(0, Math.round((Date.parse(timelineEnd) - Date.parse(timelineStart)) / 60000))
			: 0;

	$: commandBreakdown = Object.entries(
		transcriptEntries.reduce(
			(acc, entry) => {
				const key = entry.command_type || 'unknown';
				acc[key] = (acc[key] ?? 0) + 1;
				return acc;
			},
			{} as Record<string, number>
		)
	)
		.sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
		.slice(0, 5);
</script>

<section class="glass-panel p-6">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<div>
			<h2 class="text-2xl font-semibold">Session {sessionId}</h2>
			<p class="muted mt-2 text-sm">Inspect navlog and transcript entries for this session.</p>
		</div>
		<button class="rounded-md border dark:border-white/35 border-slate-300 px-3 py-2 text-xs dark:text-white text-slate-900 dark:hover:bg-white/10 hover:bg-slate-500/10" on:click={loadSessionData} disabled={loading}>
			{loading ? 'Refreshing...' : 'Refresh'}
		</button>
	</div>

	<div class="mt-4 flex flex-wrap gap-2 text-xs">
		<button class={`rounded-md border px-3 py-1 ${activeTab === 'navlog' ? 'dark:border-white border-slate-700 dark:bg-white/20 bg-slate-500/20 dark:text-white text-slate-900' : 'dark:border-white/25 border-slate-300 dark:text-white/80 text-slate-700 dark:hover:bg-white/10 hover:bg-slate-500/10'}`} on:click={() => (activeTab = 'navlog')}>
			Navlog
		</button>
		<button class={`rounded-md border px-3 py-1 ${activeTab === 'transcript' ? 'dark:border-white border-slate-700 dark:bg-white/20 bg-slate-500/20 dark:text-white text-slate-900' : 'dark:border-white/25 border-slate-300 dark:text-white/80 text-slate-700 dark:hover:bg-white/10 hover:bg-slate-500/10'}`} on:click={() => (activeTab = 'transcript')}>
			Transcript
		</button>
		<button class={`rounded-md border px-3 py-1 ${activeTab === 'summary' ? 'dark:border-white border-slate-700 dark:bg-white/20 bg-slate-500/20 dark:text-white text-slate-900' : 'dark:border-white/25 border-slate-300 dark:text-white/80 text-slate-700 dark:hover:bg-white/10 hover:bg-slate-500/10'}`} on:click={() => (activeTab = 'summary')}>
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
				<select class="rounded-md border dark:border-white/25 border-slate-300 bg-[var(--input-bg)] px-3 py-2 text-sm" bind:value={navlogEntryType} on:change={loadSessionData}>
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
						<li class="rounded-md border dark:border-white/15 border-slate-200 dark:bg-white/5 bg-slate-100/60 p-3">
							<div class="flex flex-wrap items-center justify-between gap-2">
								<p class="font-semibold">{entry.entry_type ?? 'entry'}</p>
								<span class="muted text-xs">{formatDate(entry.timestamp)}</span>
							</div>
							<p class="muted mt-1 text-xs">Action: {entry.action ?? 'n/a'} | Actor: {entry.actor_id ?? 'n/a'}</p>
							{#if entry.simulation_outcome || entry.execution_result || entry.error_message}
								<p class="mt-2 text-xs dark:text-white/85 text-slate-700">{entry.execution_result ?? entry.simulation_outcome ?? entry.error_message}</p>
							{/if}
							{#if target}
								<a
									class="mt-2 inline-block rounded-md border dark:border-white/35 border-slate-300 px-2 py-1 text-xs dark:text-white text-slate-900 dark:hover:bg-white/10 hover:bg-slate-500/10"
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
				<select class="rounded-md border dark:border-white/25 border-slate-300 bg-[var(--input-bg)] px-3 py-2 text-sm" bind:value={transcriptCommandType} on:change={loadSessionData}>
					<option value="">All command types</option>
					{#each transcriptTypeOptions as option (option)}
						<option value={option}>{option}</option>
					{/each}
				</select>
				<select class="rounded-md border dark:border-white/25 border-slate-300 bg-[var(--input-bg)] px-3 py-2 text-sm" bind:value={transcriptStatus} on:change={loadSessionData}>
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
						<li class="rounded-md border dark:border-white/15 border-slate-200 dark:bg-white/5 bg-slate-100/60 p-3">
							<div class="flex flex-wrap items-center justify-between gap-2">
								<div class="flex items-center gap-2">
									<p class="font-semibold">{entry.command_type ?? 'command'}</p>
									<span class={`rounded border px-2 py-0.5 text-[10px] uppercase tracking-[0.1em] ${statusClass(entry.status)}`}>{entry.status ?? 'n/a'}</span>
								</div>
								<span class="muted text-xs">{formatDate(entry.timestamp)}</span>
							</div>
							<p class="mt-2 text-xs font-semibold dark:text-white/90 text-slate-800">Command</p>
							<pre class="mt-1 overflow-x-auto rounded-md border dark:border-white/10 border-slate-200 dark:bg-[#0b1d33] bg-slate-100 p-2 text-xs dark:text-white/90 text-slate-800 whitespace-pre-wrap">{entry.command ?? 'n/a'}</pre>
							<p class="muted mt-2 text-xs">Actor: {entry.actor_id ?? 'n/a'} | Duration: {formatMs(entry.execution_time_ms)}</p>
							{#if entry.output_text || entry.error_message}
								<p class="mt-2 text-xs font-semibold dark:text-white/90 text-slate-800">Output</p>
								<pre class="mt-1 overflow-x-auto rounded-md border dark:border-white/10 border-slate-200 dark:bg-[#0b1d33] bg-slate-100 p-2 text-xs dark:text-white/90 text-slate-800 whitespace-pre-wrap">{formatTextBlock(entry.output_text ?? entry.error_message)}</pre>
							{/if}
							{#if entry.arguments_json}
								<details class="mt-2 rounded-md border dark:border-white/10 border-slate-200 dark:bg-white/5 bg-slate-100/60 p-2">
									<summary class="cursor-pointer text-xs font-semibold dark:text-white/90 text-slate-800">Arguments JSON</summary>
									<pre class="mt-2 overflow-x-auto text-xs dark:text-white/85 text-slate-700 whitespace-pre-wrap">{formatJsonColumn(entry.arguments_json)}</pre>
								</details>
							{/if}
							{#if entry.context_json}
								<details class="mt-2 rounded-md border dark:border-white/10 border-slate-200 dark:bg-white/5 bg-slate-100/60 p-2">
									<summary class="cursor-pointer text-xs font-semibold dark:text-white/90 text-slate-800">Context JSON</summary>
									<pre class="mt-2 overflow-x-auto text-xs dark:text-white/85 text-slate-700 whitespace-pre-wrap">{formatJsonColumn(entry.context_json)}</pre>
								</details>
							{/if}
							{#if entry.output_json}
								<details class="mt-2 rounded-md border dark:border-white/10 border-slate-200 dark:bg-white/5 bg-slate-100/60 p-2">
									<summary class="cursor-pointer text-xs font-semibold dark:text-white/90 text-slate-800">Output JSON</summary>
									<pre class="mt-2 overflow-x-auto text-xs dark:text-white/85 text-slate-700 whitespace-pre-wrap">{formatJsonColumn(entry.output_json)}</pre>
								</details>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	{:else}
		<div class="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
			<div class="rounded-md border dark:border-white/15 border-slate-200 dark:bg-white/5 bg-slate-100/60 p-4">
				<p class="muted text-xs">Navlog entries</p>
				<p class="mt-2 text-2xl font-semibold">{navlogEntries.length}</p>
			</div>
			<div class="rounded-md border dark:border-white/15 border-slate-200 dark:bg-white/5 bg-slate-100/60 p-4">
				<p class="muted text-xs">Transcript entries</p>
				<p class="mt-2 text-2xl font-semibold">{transcriptEntries.length}</p>
			</div>
			<div class="rounded-md border dark:border-white/15 border-slate-200 dark:bg-white/5 bg-slate-100/60 p-4">
				<p class="muted text-xs">Execution entries</p>
				<p class="mt-2 text-2xl font-semibold">{executionCount}</p>
			</div>
			<div class="rounded-md border dark:border-white/15 border-slate-200 dark:bg-white/5 bg-slate-100/60 p-4">
				<p class="muted text-xs">Success rate</p>
				<p class="mt-2 text-2xl font-semibold">{completionRate.toFixed(1)}%</p>
				<p class="muted text-xs">{successCount} success, {failureCount} error, {partialCount} partial</p>
			</div>
			<div class="rounded-md border dark:border-white/15 border-slate-200 dark:bg-white/5 bg-slate-100/60 p-4">
				<p class="muted text-xs">Timeline</p>
				<p class="mt-2 text-xl font-semibold">{timelineMinutes} min</p>
				<p class="muted text-xs">{formatDate(timelineStart)} to {formatDate(timelineEnd)}</p>
			</div>
			<div class="rounded-md border dark:border-white/15 border-slate-200 dark:bg-white/5 bg-slate-100/60 p-4">
				<p class="muted text-xs">Execution latency</p>
				<p class="mt-2 text-xl font-semibold">avg {formatMs(avgExecutionMs)}</p>
				<p class="muted text-xs">p95 {formatMs(p95ExecutionMs)} | max {formatMs(maxExecutionMs)}</p>
			</div>
			<div class="rounded-md border dark:border-white/15 border-slate-200 dark:bg-white/5 bg-slate-100/60 p-4 md:col-span-2 xl:col-span-2">
				<p class="muted text-xs">Navlog stage mix</p>
				<p class="mt-2 text-sm dark:text-white/90 text-slate-800">Proposal {proposalCount} | Simulation {simulationCount} | Decision {decisionCount} | Execution {executionCount}</p>
			</div>
			<div class="rounded-md border dark:border-white/15 border-slate-200 dark:bg-white/5 bg-slate-100/60 p-4 md:col-span-2 xl:col-span-2">
				<p class="muted text-xs">Top command types</p>
				{#if commandBreakdown.length === 0}
					<p class="mt-2 text-sm dark:text-white/85 text-slate-700">No command data</p>
				{:else}
					<ul class="mt-2 space-y-1 text-sm">
						{#each commandBreakdown as [name, count] (`${name}-${count}`)}
							<li>{name}: {count}</li>
						{/each}
					</ul>
				{/if}
			</div>
		</div>
	{/if}
</section>
