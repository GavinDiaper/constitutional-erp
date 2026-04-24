<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import type { CaiplArtefact } from '$lib/api/caipl';

	export let notebook: CaiplArtefact[] = [];

	const dispatch = createEventDispatcher<{ inspectNode: { nodeId: string } }>();

	function formatContent(content: Record<string, unknown> | string): string {
		if (typeof content === 'string') {
			return content;
		}
		return JSON.stringify(content, null, 2);
	}
</script>

<section class="glass-panel p-4">
	<h2 class="text-lg font-semibold">Notebook Panel</h2>
	<div class="mt-3 max-h-[320px] space-y-2 overflow-auto">
		{#if notebook.length === 0}
			<p class="text-sm ui-muted">Notebook is empty.</p>
		{:else}
			{#each notebook as item (item.id)}
				<article class="section-card p-2 text-xs">
					<div class="flex items-center justify-between gap-2">
						<p class="font-semibold uppercase tracking-wide">{item.type}</p>
						<button class="btn-ghost rounded px-2 py-1 text-[11px]" type="button" on:click={() => dispatch('inspectNode', { nodeId: item.linkedNodeId })}>Inspect Node</button>
					</div>
					<pre class="mt-1 overflow-auto whitespace-pre-wrap break-words ui-muted">{formatContent(item.content)}</pre>
				</article>
			{/each}
		{/if}
	</div>
</section>
