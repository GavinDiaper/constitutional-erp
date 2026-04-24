<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { LINA_MODE_OPTIONS, type LinaMode } from '$lib/types/lina';

	export let selectedModeId: LinaMode = LINA_MODE_OPTIONS[0].id;

	const dispatch = createEventDispatcher<{ select: { modeId: LinaMode } }>();

	function choose(modeId: LinaMode): void {
		dispatch('select', { modeId });
	}
</script>

<section class="section-card p-3">
	<p class="text-xs uppercase tracking-[0.16em] ui-muted">Mode</p>
	<div class="mt-2 flex flex-wrap gap-2">
		{#each LINA_MODE_OPTIONS as mode (mode.id)}
			<button
				type="button"
				class="btn-ghost rounded-md px-3 py-2 text-sm"
				class:btn-ghost-active={selectedModeId === mode.id}
				on:click={() => choose(mode.id)}
			>
				{mode.label}
			</button>
		{/each}
	</div>
</section>
