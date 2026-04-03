<script lang="ts">
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import { queryTable } from '$lib/api/query';
	import { actorStore } from '$lib/stores/actorStore';

	interface SalesOrderRow {
		order_id: string;
		state?: string;
		quote_id?: string;
		customer_id?: string;
		total_amount?: number | string;
		currency_code?: string;
		created_at?: string;
	}

	let loading = false;
	let errorMessage = '';
	let openOrders: SalesOrderRow[] = [];

	onMount(() => {
		const unsubscribeActor = actorStore.subscribe(() => {
			void loadOpenOrders();
		});

		if (openOrders.length === 0) {
			void loadOpenOrders();
		}

		return () => {
			unsubscribeActor();
		};
	});

	async function loadOpenOrders(): Promise<void> {
		loading = true;
		errorMessage = '';

		try {
			const result = await queryTable<SalesOrderRow>('o2c_sales_order', $actorStore);
			openOrders = (result.data ?? []).filter(isOpenOrder);
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Unable to load O2C orders.';
		} finally {
			loading = false;
		}
	}

	function isOpenOrder(order: SalesOrderRow): boolean {
		const state = (order.state ?? '').trim().toLowerCase();
		return !['closed', 'cancelled'].includes(state);
	}

	function isReadyToInvoice(order: SalesOrderRow): boolean {
		return (order.state ?? '').trim().toLowerCase() === 'shipped';
	}
</script>

<section class="glass-panel p-6">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<div>
			<h2 class="text-2xl font-semibold">Open Sales Orders</h2>
			<p class="muted mt-1 text-sm">Orders remain actionable until they are Closed or Cancelled. Shipped orders expose the generate-invoice action.</p>
		</div>
		<span class="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white">
			{openOrders.length} open orders
		</span>
	</div>

	{#if loading}
		<p class="mt-4 text-sm">Loading open sales orders...</p>
	{:else if errorMessage}
		<p class="mt-4 rounded-md border border-red-500/55 bg-red-500/10 p-3 text-sm text-red-200">{errorMessage}</p>
	{:else if openOrders.length === 0}
		<p class="mt-4 text-sm">No open sales orders found.</p>
	{:else}
		<div class="mt-4 overflow-x-auto">
			<table class="min-w-full text-left text-sm">
				<thead>
					<tr class="border-b border-white/15 text-xs uppercase tracking-[0.15em] text-white/70">
						<th class="px-3 py-2">Order</th>
						<th class="px-3 py-2">Quote</th>
						<th class="px-3 py-2">Customer</th>
						<th class="px-3 py-2">Total</th>
						<th class="px-3 py-2">State</th>
						<th class="px-3 py-2">Actionability</th>
					</tr>
				</thead>
				<tbody>
					{#each openOrders as order (order.order_id)}
						<tr class="border-b border-white/10 align-top">
							<td class="px-3 py-3 font-semibold">{order.order_id}</td>
							<td class="px-3 py-3">{order.quote_id ?? 'n/a'}</td>
							<td class="px-3 py-3">{order.customer_id ?? 'n/a'}</td>
							<td class="px-3 py-3">{order.total_amount ?? 0} {order.currency_code ?? ''}</td>
							<td class="px-3 py-3">{order.state ?? 'Unknown'}</td>
							<td class="px-3 py-3">
								<div class="flex flex-wrap gap-2">
									{#if isReadyToInvoice(order)}
										<span class="rounded-full bg-emerald-500/20 px-2 py-1 text-xs text-emerald-100">Ready to invoice</span>
									{/if}
									<a class="rounded-md border border-white/35 px-2 py-1 text-xs text-white" href={resolve(`/canvas/o2c_sales_order/${order.order_id}`)}>
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