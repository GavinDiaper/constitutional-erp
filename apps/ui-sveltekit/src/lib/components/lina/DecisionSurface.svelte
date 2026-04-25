<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import type { CaiplDecisionPoint } from '$lib/api/caipl';

	export let decisions: CaiplDecisionPoint[] = [];
	export let loading = false;
	export let selectedDecisionId: string | null = null;
	export let selectedOptionId: string | null = null;

	const dispatch = createEventDispatcher<{
		selectDecision: { decisionId: string };
		selectOption: { decisionId: string; optionId: string };
		resolve: { decisionId: string; action: 'confirm' | 'reject' | 'amend' };
	}>();

	function selectDecision(decisionId: string): void {
		dispatch('selectDecision', { decisionId });
	}

	function selectOption(decisionId: string, optionId: string): void {
		dispatch('selectOption', { decisionId, optionId });
	}

	function resolve(decisionId: string, action: 'confirm' | 'reject' | 'amend'): void {
		dispatch('resolve', { decisionId, action });
	}
</script>

<section class="glass-panel p-4">
	<h2 class="text-lg font-semibold">Decision Surface</h2>
	<div class="mt-3 space-y-2">
		{#if decisions.length === 0}
			<p class="text-sm ui-muted">No pending decisions.</p>
		{:else}
			{#each decisions as decision (decision.id)}
				<article class="item-card rounded-md p-3" class:btn-ghost-active={selectedDecisionId === decision.id}>
					<button type="button" class="w-full text-left" on:click={() => selectDecision(decision.id)}>
						<p class="text-sm font-semibold">{decision.type}</p>
						<p class="mt-1 text-xs ui-muted">Status: {decision.status}</p>
					</button>

					<div class="mt-2 flex flex-wrap gap-2">
						{#each decision.options as option (option.id)}
							{@const collectionState = option.collectionState}
							<button
								type="button"
								class="btn-ghost rounded px-2 py-1 text-xs"
								class:btn-ghost-active={selectedOptionId === option.id && selectedDecisionId === decision.id}
								on:click={() => selectOption(decision.id, option.id)}
							>
								{option.label}
								{#if collectionState}
									<span class="ml-1 ui-muted">({collectionState.resolvedFields.length}/{collectionState.requiredFields.length})</span>
								{/if}
							</button>
						{/each}
					</div>

					<div class="mt-2 flex gap-2">
						<button class="ui-soft-button px-2 py-1 text-xs" on:click={() => resolve(decision.id, 'confirm')} disabled={loading}>Confirm</button>
						<button class="ui-soft-button px-2 py-1 text-xs" on:click={() => resolve(decision.id, 'reject')} disabled={loading}>Reject</button>
						<button class="ui-soft-button px-2 py-1 text-xs" on:click={() => resolve(decision.id, 'amend')} disabled={loading}>Amend</button>
					</div>
				</article>
			{/each}
		{/if}
	</div>
</section>
