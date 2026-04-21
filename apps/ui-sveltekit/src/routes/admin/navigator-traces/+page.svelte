<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import {
		getLlmTrace,
		getLlmTraces,
		type LlmTraceRow
	} from '$lib/api/navigator';
	import { actorStore } from '$lib/stores/actorStore';

	let loading = false;
	let errorMessage = '';
	let rows: LlmTraceRow[] = [];
	let selectedTrace: LlmTraceRow | null = null;
	let selectedTraceId = '';
	let limit = '50';
	let offset = '0';
	let includeRaw = true;
	let textFilter = '';

	onMount(() => {
		const unsubscribeActor = actorStore.subscribe(() => {
			void refresh();
		});

		return () => {
			unsubscribeActor();
		};
	});

	async function refresh(): Promise<void> {
		loading = true;
		errorMessage = '';

		try {
			const response = await getLlmTraces($actorStore, {
				limit: Number(limit) || 50,
				offset: Number(offset) || 0,
				includeRaw
			});
			rows = response.data ?? [];

			if (selectedTraceId) {
				const stillExists = rows.some((row) => row.id === selectedTraceId);
				if (!stillExists) {
					selectedTraceId = '';
					selectedTrace = null;
				}
			}
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Unable to load Navigator LLM traces.';
			rows = [];
			selectedTraceId = '';
			selectedTrace = null;
		} finally {
			loading = false;
		}
	}

	async function selectTrace(id: string): Promise<void> {
		if (!id || loading) {
			return;
		}

		selectedTraceId = id;
		errorMessage = '';
		selectedTrace = null;

		try {
			const response = await getLlmTrace(id, $actorStore, includeRaw);
			selectedTrace = response.data;
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Unable to load selected trace.';
			selectedTrace = null;
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

	function includesText(row: LlmTraceRow, filter: string): boolean {
		const normalized = filter.trim().toLowerCase();
		if (!normalized) {
			return true;
		}

		const haystack = [
			row.id,
			row.kind,
			row.model,
			row.response.text,
			...row.request.messages.map((message) => `${message.role ?? ''} ${message.content ?? ''}`)
		]
			.join(' ')
			.toLowerCase();

		return haystack.includes(normalized);
	}

	function prettyJson(value: unknown): string {
		if (value === undefined) {
			return '';
		}
		return JSON.stringify(value, null, 2);
	}

	$: filteredRows = rows.filter((row) => includesText(row, textFilter));
	$: selectedSummary = rows.find((row) => row.id === selectedTraceId) ?? null;
</script>

<section class="glass-panel p-6">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<div>
			<h2 class="text-2xl font-semibold">Navigator LLM Traces</h2>
			<p class="muted mt-2 text-sm">Inspect outbound LLM payloads and model responses from navigator-ai.</p>
		</div>
		<div class="flex flex-wrap items-center gap-2">
			<a class="rounded-md border dark:border-white/35 border-slate-300 px-3 py-2 text-xs dark:text-white text-slate-900 dark:hover:bg-white/10 hover:bg-slate-500/10" href={resolve('/admin')}>
				Back to Admin
			</a>
			<button class="rounded-md border dark:border-white/35 border-slate-300 px-3 py-2 text-xs dark:text-white text-slate-900 dark:hover:bg-white/10 hover:bg-slate-500/10" on:click={refresh} disabled={loading}>
				{loading ? 'Refreshing...' : 'Refresh'}
			</button>
		</div>
	</div>

	<div class="mt-4 grid gap-2 md:grid-cols-4">
		<input
			class="rounded-md border dark:border-white/25 border-slate-300 bg-[var(--input-bg)] px-3 py-2 text-sm"
			placeholder="Filter traces"
			bind:value={textFilter}
		/>
		<select class="rounded-md border dark:border-white/25 border-slate-300 bg-[var(--input-bg)] px-3 py-2 text-sm" bind:value={limit} on:change={refresh}>
			<option value="20">20 rows</option>
			<option value="50">50 rows</option>
			<option value="100">100 rows</option>
		</select>
		<input
			type="number"
			min="0"
			class="rounded-md border dark:border-white/25 border-slate-300 bg-[var(--input-bg)] px-3 py-2 text-sm"
			placeholder="Offset"
			bind:value={offset}
			on:change={refresh}
		/>
		<label class="flex items-center gap-2 rounded-md border dark:border-white/25 border-slate-300 bg-[var(--input-bg)] px-3 py-2 text-sm">
			<input type="checkbox" bind:checked={includeRaw} on:change={refresh} />
			Include raw payload fields
		</label>
	</div>

	{#if errorMessage}
		<p class="mt-4 rounded-md border border-red-500/55 bg-red-500/10 p-3 text-sm text-red-200">{errorMessage}</p>
	{:else if loading}
		<p class="mt-4 text-sm">Loading traces...</p>
	{:else if filteredRows.length === 0}
		<p class="mt-4 text-sm">No traces match the current filters.</p>
	{:else}
		<div class="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
			<div class="overflow-x-auto rounded-md border dark:border-white/10 border-slate-200">
				<table class="min-w-full text-left text-sm">
					<thead>
						<tr class="border-b dark:border-white/15 border-slate-200 text-xs uppercase tracking-[0.15em] dark:text-white/70 text-slate-600">
							<th class="px-3 py-2">When</th>
							<th class="px-3 py-2">Model</th>
							<th class="px-3 py-2">Messages</th>
							<th class="px-3 py-2">Open</th>
						</tr>
					</thead>
					<tbody>
						{#each filteredRows as row (row.id)}
							<tr class="border-b dark:border-white/10 border-slate-200 align-top">
								<td class="px-3 py-3 text-xs">{formatDate(row.createdAt)}</td>
								<td class="px-3 py-3">
									<p class="font-semibold">{row.model}</p>
									<p class="muted text-xs">{row.id}</p>
								</td>
								<td class="px-3 py-3 text-xs">{row.request.messageCount}</td>
								<td class="px-3 py-3">
									<button
										class="rounded-md border dark:border-white/35 border-slate-300 px-2 py-1 text-xs dark:text-white text-slate-900 dark:hover:bg-white/10 hover:bg-slate-500/10 disabled:opacity-40"
										on:click={() => selectTrace(row.id)}
										disabled={loading}
									>
										View
									</button>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>

			<div class="rounded-md border dark:border-white/10 border-slate-200 p-3">
				{#if selectedTrace}
					<div class="mb-3 text-xs muted">
						<p>Trace: <span class="font-semibold">{selectedTrace.id}</span></p>
						<p>Model: <span class="font-semibold">{selectedTrace.model}</span></p>
						<p>Time: <span class="font-semibold">{formatDate(selectedTrace.createdAt)}</span></p>
					</div>

					<h3 class="text-sm font-semibold">Request Messages</h3>
					<pre class="mt-2 max-h-52 overflow-auto rounded bg-black/10 p-3 text-xs">{prettyJson(selectedTrace.request.messages)}</pre>

					<h3 class="mt-4 text-sm font-semibold">Response Text</h3>
					<pre class="mt-2 max-h-52 overflow-auto rounded bg-black/10 p-3 text-xs whitespace-pre-wrap">{selectedTrace.response.text}</pre>

					{#if selectedTrace.response.parsedJson !== undefined}
						<h3 class="mt-4 text-sm font-semibold">Response Parsed JSON</h3>
						<pre class="mt-2 max-h-52 overflow-auto rounded bg-black/10 p-3 text-xs">{prettyJson(selectedTrace.response.parsedJson)}</pre>
					{/if}

					{#if includeRaw && selectedTrace.raw}
						<h3 class="mt-4 text-sm font-semibold">Raw Prompt Payload</h3>
						<pre class="mt-2 max-h-52 overflow-auto rounded bg-black/10 p-3 text-xs whitespace-pre-wrap">{selectedTrace.raw.promptJson}</pre>
					{/if}
				{:else}
					<p class="text-sm">Select a trace row to view payload and response details.</p>
					{#if selectedSummary}
						<p class="muted mt-2 text-xs">Selected trace summary is available but full details have not been loaded yet.</p>
					{/if}
				{/if}
			</div>
		</div>
	{/if}
</section>
