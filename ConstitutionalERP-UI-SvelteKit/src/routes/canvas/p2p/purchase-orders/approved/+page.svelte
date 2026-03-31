<script lang="ts">
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import { isApprovedPo } from '$lib/api/dashboard';
	import { queryTable } from '$lib/api/query';
	import { actorStore } from '$lib/stores/actorStore';

	interface PurchaseOrderRow {
		po_id: string;
		supplier_id?: string;
		total_amount?: number;
		currency_code?: string;
		state?: string;
	}

	let loading = false;
	let errorMessage = '';
	let approvedOrders: PurchaseOrderRow[] = [];

	onMount(() => {
		const unsubscribeActor = actorStore.subscribe(() => {
			void loadApprovedOrders();
		});

		void loadApprovedOrders();

		return () => {
			unsubscribeActor();
		};
	});

	async function loadApprovedOrders(): Promise<void> {
		loading = true;
		errorMessage = '';

		try {
			const result = await queryTable<PurchaseOrderRow>('p2p_purchase_order', $actorStore);
			approvedOrders = (result.data ?? []).filter(isApprovedPo);
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Unable to load approved purchase orders.';
		} finally {
			loading = false;
		}
	}
</script>

<section class="glass-panel p-6">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<div>
			<h2 class="text-2xl font-semibold">Approved Purchase Orders</h2>
			<p class="muted mt-1 text-sm">Showing approved P2P purchase orders.</p>
		</div>
		<span class="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white">
			{approvedOrders.length} approved POs
		</span>
	</div>

	{#if loading}
		<p class="mt-4 text-sm">Loading approved purchase orders...</p>
	{:else if errorMessage}
		<p class="mt-4 rounded-md border border-red-500/55 bg-red-500/10 p-3 text-sm text-red-200">{errorMessage}</p>
	{:else if approvedOrders.length === 0}
		<p class="mt-4 text-sm">No approved purchase orders found.</p>
	{:else}
		<div class="mt-4 overflow-x-auto">
			<table class="min-w-full text-left text-sm">
				<thead>
					<tr class="border-b border-white/15 text-xs uppercase tracking-[0.15em] text-white/70">
						<th class="px-3 py-2">PO</th>
						<th class="px-3 py-2">Supplier</th>
						<th class="px-3 py-2">Total</th>
						<th class="px-3 py-2">State</th>
						<th class="px-3 py-2">Process</th>
					</tr>
				</thead>
				<tbody>
					{#each approvedOrders as po (po.po_id)}
						<tr class="border-b border-white/10 align-top">
							<td class="px-3 py-3 font-semibold">{po.po_id}</td>
							<td class="px-3 py-3">{po.supplier_id ?? 'n/a'}</td>
							<td class="px-3 py-3">{po.total_amount ?? 0} {po.currency_code ?? ''}</td>
							<td class="px-3 py-3">{po.state ?? 'unknown'}</td>
							<td class="px-3 py-3">
								<a class="rounded-md border border-white/35 px-2 py-1 text-xs text-white" href={resolve(`/canvas/p2p_purchase_order/${po.po_id}`)}>
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
