<script lang="ts">
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import { getEvents, type EventRow } from '$lib/api/events';
	import { actorStore } from '$lib/stores/actorStore';

	let loading = false;
	let errorMessage = '';
	let events: EventRow[] = [];
	let textFilter = '';
	let eventTypeFilter = '';
	let entityTypeFilter = '';
	let pageSize = '150';
	let currentAfter = '';
	let nextAfter = '';
	let previousAfterStack: string[] = [];
	let currentPageCount = 0;
	let hasMore = false;

	onMount(() => {
		const unsubscribeActor = actorStore.subscribe(() => {
			void resetAndLoad();
		});

		void resetAndLoad();

		return () => {
			unsubscribeActor();
		};
	});

	async function resetAndLoad(): Promise<void> {
		currentAfter = '';
		nextAfter = '';
		previousAfterStack = [];
		await loadEvents('');
	}

	async function loadEvents(after: string): Promise<void> {
		loading = true;
		errorMessage = '';

		try {
			const response = await getEvents($actorStore, {
				limit: Number(pageSize) || 150,
				after: after || undefined
			});
			events = response.data ?? [];
			currentAfter = after;
			currentPageCount = events.length;
			hasMore = events.length >= (Number(pageSize) || 150);

			const lastTimestamp = events.length > 0 ? events[events.length - 1].timestamp : '';
			nextAfter = lastTimestamp || '';
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Unable to load events.';
		} finally {
			loading = false;
		}
	}

	function nextPage(): void {
		if (!nextAfter || loading) {
			return;
		}

		previousAfterStack = [...previousAfterStack, currentAfter];
		void loadEvents(nextAfter);
	}

	function previousPage(): void {
		if (previousAfterStack.length === 0 || loading) {
			return;
		}

		const previousAfter = previousAfterStack[previousAfterStack.length - 1] ?? '';
		previousAfterStack = previousAfterStack.slice(0, -1);
		void loadEvents(previousAfter);
	}

	function match(value: string | undefined, filter: string): boolean {
		const candidate = (value ?? '').toLowerCase();
		const normalized = filter.trim().toLowerCase();
		if (!normalized) {
			return true;
		}
		return candidate.includes(normalized);
	}

	function pretty(value: string | undefined): string {
		const source = (value ?? '').trim();
		if (!source) {
			return 'n/a';
		}
		return source.replace(/[_-]+/g, ' ');
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

	function processTarget(event: EventRow): { entityType: string; entityId: string } | null {
		if (!event.entity_type || !event.entity_id) {
			return null;
		}

		const map: Record<string, string> = {
			o2c_customer: 'o2c_customer',
			o2c_quote: 'o2c_quote',
			o2c_sales_order: 'o2c_sales_order',
			o2c_invoice: 'o2c_invoice',
			o2c_payment: 'o2c_payment',
			p2p_supplier: 'p2p_supplier',
			p2p_requisition: 'p2p_requisition',
			p2p_purchase_order: 'p2p_purchase_order',
			p2p_goods_receipt: 'p2p_goods_receipt',
			p2p_supplier_invoice: 'p2p_supplier_invoice',
			p2p_ap_payment: 'p2p_ap_payment',
			r2r_journal: 'r2r_journal',
			h2r_employee: 'h2r_employee'
		};

		const entityType = map[event.entity_type];
		if (!entityType) {
			return null;
		}

		return {
			entityType,
			entityId: event.entity_id
		};
	}

	$: eventTypes = Array.from(new Set(events.map((row) => row.event_type).filter((value): value is string => typeof value === 'string' && value.length > 0))).sort((a, b) =>
		a.localeCompare(b)
	);
	$: entityTypes = Array.from(new Set(events.map((row) => row.entity_type).filter((value): value is string => typeof value === 'string' && value.length > 0))).sort((a, b) =>
		a.localeCompare(b)
	);

	$: filteredEvents = events.filter((row) => {
		const matchesText =
			match(row.event_id, textFilter) ||
			match(row.event_type, textFilter) ||
			match(row.entity_id, textFilter) ||
			match(row.entity_type, textFilter);
		const matchesEventType = !eventTypeFilter || row.event_type === eventTypeFilter;
		const matchesEntityType = !entityTypeFilter || row.entity_type === entityTypeFilter;
		return matchesText && matchesEventType && matchesEntityType;
	});
</script>

<section class="glass-panel p-6">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<div>
			<h2 class="text-2xl font-semibold">Event Stream Viewer</h2>
			<p class="muted mt-2 text-sm">Audit-ready stream of domain events with links to related process entities.</p>
		</div>
		<button class="rounded-md border dark:border-white/35 border-slate-300 px-3 py-2 text-xs dark:text-white text-slate-900 dark:hover:bg-white/10 hover:bg-slate-500/10" on:click={resetAndLoad} disabled={loading}>
			{loading ? 'Refreshing...' : 'Refresh'}
		</button>
	</div>

	<div class="mt-4 grid gap-2 md:grid-cols-4">
		<input
			class="rounded-md border dark:border-white/25 border-slate-300 bg-[var(--input-bg)] px-3 py-2 text-sm"
			placeholder="Filter by id, type, entity"
			bind:value={textFilter}
		/>
		<select class="rounded-md border dark:border-white/25 border-slate-300 bg-[var(--input-bg)] px-3 py-2 text-sm" bind:value={eventTypeFilter}>
			<option value="">All event types</option>
			{#each eventTypes as eventType (eventType)}
				<option value={eventType}>{eventType}</option>
			{/each}
		</select>
		<select class="rounded-md border dark:border-white/25 border-slate-300 bg-[var(--input-bg)] px-3 py-2 text-sm" bind:value={entityTypeFilter}>
			<option value="">All entity types</option>
			{#each entityTypes as entityType (entityType)}
				<option value={entityType}>{entityType}</option>
			{/each}
		</select>
		<select class="rounded-md border dark:border-white/25 border-slate-300 bg-[var(--input-bg)] px-3 py-2 text-sm" bind:value={pageSize} on:change={resetAndLoad}>
			<option value="100">100 rows</option>
			<option value="150">150 rows</option>
			<option value="250">250 rows</option>
		</select>
	</div>

	<div class="mt-3 flex flex-wrap items-center gap-2 text-xs">
		<button class="rounded-md border dark:border-white/35 border-slate-300 px-2 py-1 dark:text-white text-slate-900 dark:hover:bg-white/10 hover:bg-slate-500/10 disabled:opacity-40" on:click={previousPage} disabled={loading || previousAfterStack.length === 0}>
			Previous Page
		</button>
		<button class="rounded-md border dark:border-white/35 border-slate-300 px-2 py-1 dark:text-white text-slate-900 dark:hover:bg-white/10 hover:bg-slate-500/10 disabled:opacity-40" on:click={nextPage} disabled={loading || !hasMore || !nextAfter}>
			Next Page
		</button>
		<button class="rounded-md border dark:border-white/35 border-slate-300 px-2 py-1 dark:text-white text-slate-900 dark:hover:bg-white/10 hover:bg-slate-500/10 disabled:opacity-40" on:click={resetAndLoad} disabled={loading || (currentAfter === '' && previousAfterStack.length === 0)}>
			Reset Cursor
		</button>
		<span class="muted">Rows {currentPageCount} | Cursor {currentAfter || 'start'} {#if !hasMore}(end){/if}</span>
	</div>

	{#if errorMessage}
		<p class="mt-4 rounded-md border border-red-500/55 bg-red-500/10 p-3 text-sm text-red-200">{errorMessage}</p>
	{:else if loading}
		<p class="mt-4 text-sm">Loading event stream...</p>
	{:else if filteredEvents.length === 0}
		<p class="mt-4 text-sm">No events match the current filters.</p>
	{:else}
		<div class="mt-4 overflow-x-auto">
			<table class="min-w-full text-left text-sm">
				<thead>
					<tr class="border-b dark:border-white/15 border-slate-200 text-xs uppercase tracking-[0.15em] dark:text-white/70 text-slate-600">
						<th class="px-3 py-2">Timestamp</th>
						<th class="px-3 py-2">Event</th>
						<th class="px-3 py-2">Entity</th>
						<th class="px-3 py-2">Version</th>
						<th class="px-3 py-2">Action</th>
					</tr>
				</thead>
				<tbody>
					{#each filteredEvents as event (event.event_id)}
						{@const target = processTarget(event)}
						<tr class="border-b dark:border-white/10 border-slate-200 align-top">
							<td class="px-3 py-3 text-xs">{formatDate(event.timestamp)}</td>
							<td class="px-3 py-3">
								<p class="font-semibold">{event.event_type}</p>
								<p class="muted text-xs">{event.event_id}</p>
							</td>
							<td class="px-3 py-3 text-xs">
								<p>{pretty(event.entity_type)}</p>
								<p class="muted">{event.entity_id ?? 'n/a'}</p>
							</td>
							<td class="px-3 py-3 text-xs">{event.version ?? 'n/a'}</td>
							<td class="px-3 py-3">
								{#if target}
									<a
										class="rounded-md border dark:border-white/35 border-slate-300 px-2 py-1 text-xs dark:text-white text-slate-900 dark:hover:bg-white/10 hover:bg-slate-500/10"
										href={resolve('/canvas/[entityType]/[entityId]', target)}
									>
										Open Process
									</a>
								{:else}
									<span class="muted text-xs">No process link</span>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</section>
