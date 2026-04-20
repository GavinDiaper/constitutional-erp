<script lang="ts">
	import { resolve } from '$app/paths';
	import { isDraftQuote } from '$lib/api/dashboard';
	import { onMount } from 'svelte';
	import { getO2CQuotes, type O2CQuote } from '$lib/api/quotes';
	import { actorStore } from '$lib/stores/actorStore';

	let loading = false;
	let errorMessage = '';
	let draftQuotes: O2CQuote[] = [];

	onMount(() => {
		const unsubscribeActor = actorStore.subscribe(() => {
			void loadDraftQuotes();
		});

		return () => {
			unsubscribeActor();
		};
	});

	async function loadDraftQuotes(): Promise<void> {
		loading = true;
		errorMessage = '';

		try {
			const result = await getO2CQuotes($actorStore);
			draftQuotes = (result.data ?? []).filter(isDraftQuote);
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Unable to load draft quotes.';
		} finally {
			loading = false;
		}
	}

	function getActionNames(quote: O2CQuote): string[] {
		if (!quote._links) {
			return [];
		}

		return Object.keys(quote._links).filter((name) => !['self', 'collection'].includes(name));
	}
</script>

<section class="glass-panel p-6">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<div>
			<h2 class="text-2xl font-semibold">Draft Quotes</h2>
			<p class="muted mt-1 text-sm">Showing draft O2C quotes and currently available actions.</p>
		</div>
		<span class="rounded-full dark:bg-white/10 bg-slate-500/10 px-3 py-1 text-xs font-semibold dark:text-white text-slate-900">
			{draftQuotes.length} draft quotes
		</span>
	</div>

	{#if loading}
		<p class="mt-4 text-sm">Loading draft quotes...</p>
	{:else if errorMessage}
		<p class="mt-4 rounded-md border border-red-500/55 bg-red-500/10 p-3 text-sm text-red-200">{errorMessage}</p>
	{:else if draftQuotes.length === 0}
		<p class="mt-4 text-sm">No draft quotes found.</p>
	{:else}
		<div class="mt-4 overflow-x-auto">
			<table class="min-w-full text-left text-sm">
				<thead>
					<tr class="border-b dark:border-white/15 border-slate-200 text-xs uppercase tracking-[0.15em] dark:text-white/70 text-slate-600">
						<th class="px-3 py-2">Quote</th>
						<th class="px-3 py-2">Customer</th>
						<th class="px-3 py-2">Total</th>
						<th class="px-3 py-2">State</th>
						<th class="px-3 py-2">Actions</th>
					</tr>
				</thead>
				<tbody>
					{#each draftQuotes as quote (quote.quote_id)}
						<tr class="border-b dark:border-white/10 border-slate-200 align-top">
							<td class="px-3 py-3 font-semibold">{quote.quote_id}</td>
							<td class="px-3 py-3">{quote.customer_id ?? 'n/a'}</td>
							<td class="px-3 py-3">{quote.total_amount ?? 0} {quote.currency_code ?? ''}</td>
							<td class="px-3 py-3">{quote.state}</td>
							<td class="px-3 py-3">
								<div class="flex flex-wrap gap-2">
									{#each getActionNames(quote) as action (action)}
										<span class="rounded-full bg-white/15 px-2 py-1 text-xs">{action}</span>
									{/each}
									<a
										class="rounded-md border dark:border-white/35 border-slate-300 px-2 py-1 text-xs dark:text-white text-slate-900"
										href={resolve(`/canvas/o2c_quote/${quote.quote_id}`)}
									>
										Open Process
									</a>
								</div>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</section>
