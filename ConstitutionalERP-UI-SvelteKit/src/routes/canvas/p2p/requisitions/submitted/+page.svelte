<script lang="ts">
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import { isSubmittedRequisition } from '$lib/api/dashboard';
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
	let submittedRequisitions: RequisitionRow[] = [];

	onMount(() => {
		const unsubscribeActor = actorStore.subscribe(() => {
			void loadSubmittedRequisitions();
		});

		void loadSubmittedRequisitions();

		return () => {
			unsubscribeActor();
		};
	});

	async function loadSubmittedRequisitions(): Promise<void> {
		loading = true;
		errorMessage = '';

		try {
			const result = await queryTable<RequisitionRow>('p2p_requisition', $actorStore);
			submittedRequisitions = (result.data ?? []).filter(isSubmittedRequisition);
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Unable to load submitted requisitions.';
		} finally {
			loading = false;
		}
	}
</script>

<section class="glass-panel p-6">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<div>
			<h2 class="text-2xl font-semibold">Submitted Requisitions</h2>
			<p class="muted mt-1 text-sm">Showing submitted P2P requisitions pending approval actions.</p>
		</div>
		<span class="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white">
			{submittedRequisitions.length} submitted requisitions
		</span>
	</div>

	{#if loading}
		<p class="mt-4 text-sm">Loading submitted requisitions...</p>
	{:else if errorMessage}
		<p class="mt-4 rounded-md border border-red-500/55 bg-red-500/10 p-3 text-sm text-red-200">{errorMessage}</p>
	{:else if submittedRequisitions.length === 0}
		<p class="mt-4 text-sm">No submitted requisitions found.</p>
	{:else}
		<div class="mt-4 overflow-x-auto">
			<table class="min-w-full text-left text-sm">
				<thead>
					<tr class="border-b border-white/15 text-xs uppercase tracking-[0.15em] text-white/70">
						<th class="px-3 py-2">Requisition</th>
						<th class="px-3 py-2">Requester</th>
						<th class="px-3 py-2">Total</th>
						<th class="px-3 py-2">State</th>
						<th class="px-3 py-2">Process</th>
					</tr>
				</thead>
				<tbody>
					{#each submittedRequisitions as requisition (requisition.requisition_id)}
						<tr class="border-b border-white/10 align-top">
							<td class="px-3 py-3 font-semibold">{requisition.requisition_id}</td>
							<td class="px-3 py-3">{requisition.requester ?? 'n/a'}</td>
							<td class="px-3 py-3">{requisition.total_amount ?? 0} {requisition.currency_code ?? ''}</td>
							<td class="px-3 py-3">{requisition.state ?? 'unknown'}</td>
							<td class="px-3 py-3">
								<a class="rounded-md border border-white/35 px-2 py-1 text-xs text-white" href={resolve(`/canvas/p2p_requisition/${requisition.requisition_id}`)}>
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
