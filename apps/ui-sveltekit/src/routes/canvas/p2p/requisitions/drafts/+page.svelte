<script lang="ts">
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import { isDraftRequisition } from '$lib/api/dashboard';
	import { queryTable } from '$lib/api/query';
	import { actorStore } from '$lib/stores/actorStore';

	interface RequisitionRow {
		requisition_id: string;
		requester?: string;
		total_amount?: number;
		currency_code?: string;
		state?: string;
	}

	let loading = false;
	let errorMessage = '';
	let draftRequisitions: RequisitionRow[] = [];

	onMount(() => {
		const unsubscribeActor = actorStore.subscribe(() => {
			void loadDraftRequisitions();
		});

		return () => {
			unsubscribeActor();
		};
	});

	async function loadDraftRequisitions(): Promise<void> {
		loading = true;
		errorMessage = '';

		try {
			const result = await queryTable<RequisitionRow>('p2p_requisition', $actorStore);
			draftRequisitions = (result.data ?? []).filter(isDraftRequisition);
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Unable to load draft requisitions.';
		} finally {
			loading = false;
		}
	}
</script>

<section class="glass-panel p-6">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<div>
			<h2 class="text-2xl font-semibold">Draft Requisitions</h2>
			<p class="muted mt-1 text-sm">Showing draft P2P requisitions ready for process actions.</p>
		</div>
		<span class="rounded-full dark:bg-white/10 bg-slate-500/10 px-3 py-1 text-xs font-semibold dark:text-white text-slate-900">
			{draftRequisitions.length} draft requisitions
		</span>
	</div>

	{#if loading}
		<p class="mt-4 text-sm">Loading draft requisitions...</p>
	{:else if errorMessage}
		<p class="mt-4 rounded-md border border-red-500/55 bg-red-500/10 p-3 text-sm text-red-200">{errorMessage}</p>
	{:else if draftRequisitions.length === 0}
		<p class="mt-4 text-sm">No draft requisitions found.</p>
	{:else}
		<div class="mt-4 overflow-x-auto">
			<table class="min-w-full text-left text-sm">
				<thead>
					<tr class="border-b dark:border-white/15 border-slate-200 text-xs uppercase tracking-[0.15em] dark:text-white/70 text-slate-600">
						<th class="px-3 py-2">Requisition</th>
						<th class="px-3 py-2">Requester</th>
						<th class="px-3 py-2">Total</th>
						<th class="px-3 py-2">State</th>
						<th class="px-3 py-2">Process</th>
					</tr>
				</thead>
				<tbody>
					{#each draftRequisitions as requisition (requisition.requisition_id)}
						<tr class="border-b dark:border-white/10 border-slate-200 align-top">
							<td class="px-3 py-3 font-semibold">{requisition.requisition_id}</td>
							<td class="px-3 py-3">{requisition.requester ?? 'n/a'}</td>
							<td class="px-3 py-3">{requisition.total_amount ?? 0} {requisition.currency_code ?? ''}</td>
							<td class="px-3 py-3">{requisition.state ?? 'unknown'}</td>
							<td class="px-3 py-3">
								<a class="rounded-md border dark:border-white/35 border-slate-300 px-2 py-1 text-xs dark:text-white text-slate-900" href={resolve(`/canvas/p2p_requisition/${requisition.requisition_id}`)}>
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