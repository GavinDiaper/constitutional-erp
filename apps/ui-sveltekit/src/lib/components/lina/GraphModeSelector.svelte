<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import type { LinaGraphMode } from '$lib/stores/linaGraphMode';

	export let graphMode: LinaGraphMode = 'plan';

	const dispatch = createEventDispatcher<{ select: { graphMode: LinaGraphMode } }>();

	function choose(graphModeValue: LinaGraphMode): void {
		dispatch('select', { graphMode: graphModeValue });
	}
</script>

<div class="mt-2 flex flex-wrap gap-2">
	<button type="button" class="btn-ghost rounded px-2 py-1 text-xs" class:btn-ghost-active={graphMode === 'plan'} on:click={() => choose('plan')}>Plan View</button>
	<button type="button" class="btn-ghost rounded px-2 py-1 text-xs" class:btn-ghost-active={graphMode === 'explore'} on:click={() => choose('explore')}>Explore View</button>
	<button type="button" class="btn-ghost rounded px-2 py-1 text-xs" class:btn-ghost-active={graphMode === 'status'} on:click={() => choose('status')}>Status View</button>
</div>
