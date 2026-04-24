<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { LINA_MODE_OPTIONS, type LinaMode } from '$lib/types/lina';
	import { cycleIndex, toDirectionalKey } from '$lib/utils/directionalNavigation';

	export let selectedModeId: LinaMode = LINA_MODE_OPTIONS[0].id;

	const dispatch = createEventDispatcher<{ select: { modeId: LinaMode } }>();

	function choose(modeId: LinaMode): void {
		dispatch('select', { modeId });
	}

	function handleKeydown(event: KeyboardEvent): void {
		const key = toDirectionalKey(event.key);
		if (key === 'none') {
			return;
		}

		event.preventDefault();
		const currentIndex = LINA_MODE_OPTIONS.findIndex((mode) => mode.id === selectedModeId);

		if (key === 'activate' && currentIndex >= 0) {
			choose(LINA_MODE_OPTIONS[currentIndex].id);
			return;
		}

		if (key === 'next' || key === 'previous') {
			const nextIndex = cycleIndex(currentIndex, LINA_MODE_OPTIONS.length, key);
			choose(LINA_MODE_OPTIONS[nextIndex].id);
		}
	}
</script>

<section class="section-card p-3">
	<div tabindex="0" role="tablist" aria-label="Lina mode selector" on:keydown={handleKeydown}>
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
	</div>
</section>
