<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import type { LinaActionOption } from '$lib/types/lina';

	export let actions: LinaActionOption[] = [];
	export let selectedActionId: string | null = null;
	export let loading = false;

	const dispatch = createEventDispatcher<{
		select: { actionId: string };
		execute: { actionId: string };
	}>();

	function pick(actionId: string): void {
		dispatch('select', { actionId });
	}

	function execute(actionId: string): void {
		dispatch('execute', { actionId });
	}
</script>

<section class="glass-panel p-4">
	<div class="flex items-center justify-between gap-2">
		<h2 class="text-lg font-semibold">Action Surface</h2>
		<span class="text-xs ui-muted">Option-first</span>
	</div>

	<div class="mt-3 space-y-2">
		{#if actions.length === 0}
			<p class="text-sm ui-muted">No predicted actions yet. Start a session or send a turn.</p>
		{:else}
			{#each actions as action (action.id)}
				<article class="item-card rounded-md p-3" class:btn-ghost-active={selectedActionId === action.id}>
					<button
						type="button"
						class="w-full text-left"
						on:click={() => pick(action.id)}
					>
						<p class="text-sm font-semibold">{action.label}</p>
						<p class="mt-1 text-xs ui-muted">{action.description}</p>
					</button>
					<div class="mt-2">
						<button
							type="button"
							class="ui-soft-button px-2 py-1 text-xs"
							disabled={loading}
							on:click={() => execute(action.id)}
						>
							Use Action
						</button>
					</div>
				</article>
			{/each}
		{/if}
	</div>
</section>
