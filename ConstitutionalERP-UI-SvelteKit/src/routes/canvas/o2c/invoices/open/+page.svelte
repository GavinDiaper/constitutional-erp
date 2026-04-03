<script lang="ts">
	import { resolve } from '$app/paths';
	import { isOpenInvoice } from '$lib/api/dashboard';
	import { queryTable } from '$lib/api/query';
	import { actorStore } from '$lib/stores/actorStore';
	import { onMount } from 'svelte';

	interface InvoiceRow {
		invoice_id: string;
		state?: string;
		order_id?: string;
		amount_due?: number | string;
		amount_paid?: number | string;
		created_at?: string;
	}

	let loading = false;
	let errorMessage = '';
	let openInvoices: InvoiceRow[] = [];

	onMount(() => {
		const unsubscribeActor = actorStore.subscribe(() => {
			void loadOpenInvoices();
		});

		if (openInvoices.length === 0) {
			void loadOpenInvoices();
		}

		return () => {
			unsubscribeActor();
		};
	});

	async function loadOpenInvoices(): Promise<void> {
		loading = true;
		errorMessage = '';

		try {
			const result = await queryTable<InvoiceRow>('o2c_invoice', $actorStore);
			openInvoices = (result.data ?? []).filter(isOpenInvoice);
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Unable to load open invoices.';
		} finally {
			loading = false;
		}
	}

	function formatAmount(value: number | string | undefined): string {
		if (typeof value === 'number' && Number.isFinite(value)) {
			return value.toFixed(2);
		}

		if (typeof value === 'string' && value.trim()) {
			const parsed = Number(value);
			return Number.isFinite(parsed) ? parsed.toFixed(2) : value;
		}

		return '0.00';
	}
</script>

<section class="glass-panel p-6">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<div>
			<h2 class="text-2xl font-semibold">Open AR Invoices</h2>
			<p class="muted mt-1 text-sm">Invoices stay open until fully paid, reconciled, written off, or cancelled.</p>
		</div>
		<span class="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white">
			{openInvoices.length} open invoices
		</span>
	</div>

	{#if loading}
		<p class="mt-4 text-sm">Loading open invoices...</p>
	{:else if errorMessage}
		<p class="mt-4 rounded-md border border-red-500/55 bg-red-500/10 p-3 text-sm text-red-200">{errorMessage}</p>
	{:else if openInvoices.length === 0}
		<p class="mt-4 text-sm">No open invoices found.</p>
	{:else}
		<div class="mt-4 overflow-x-auto">
			<table class="min-w-full text-left text-sm">
				<thead>
					<tr class="border-b border-white/15 text-xs uppercase tracking-[0.15em] text-white/70">
						<th class="px-3 py-2">Invoice</th>
						<th class="px-3 py-2">Order</th>
						<th class="px-3 py-2">Amount Due</th>
						<th class="px-3 py-2">Amount Paid</th>
						<th class="px-3 py-2">State</th>
						<th class="px-3 py-2">Actions</th>
					</tr>
				</thead>
				<tbody>
					{#each openInvoices as invoice (invoice.invoice_id)}
						<tr class="border-b border-white/10 align-top">
							<td class="px-3 py-3 font-semibold">{invoice.invoice_id}</td>
							<td class="px-3 py-3">{invoice.order_id ?? 'n/a'}</td>
							<td class="px-3 py-3">{formatAmount(invoice.amount_due)}</td>
							<td class="px-3 py-3">{formatAmount(invoice.amount_paid)}</td>
							<td class="px-3 py-3">{invoice.state ?? 'Unknown'}</td>
							<td class="px-3 py-3">
								<a class="rounded-md border border-white/35 px-2 py-1 text-xs text-white" href={resolve(`/canvas/o2c_invoice/${invoice.invoice_id}`)}>
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