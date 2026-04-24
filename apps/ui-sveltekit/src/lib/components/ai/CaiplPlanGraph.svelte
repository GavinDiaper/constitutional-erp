<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { afterUpdate, onMount } from 'svelte';
	import type { CaiplPlanEdge, CaiplPlanNode } from '$lib/api/caipl';
	import { renderCaiplGraph } from '$lib/d3/caiplGraphRenderer';
	import type { LinaGraphMode } from '$lib/stores/linaGraphMode';

	export let nodes: CaiplPlanNode[] = [];
	export let edges: CaiplPlanEdge[] = [];
	export let selectedNodeId: string | null = null;
	export let graphMode: LinaGraphMode = 'plan';

	const dispatch = createEventDispatcher<{ select: { nodeId: string } }>();
	let svgEl: SVGSVGElement | undefined;

	function paint(): void {
		if (!svgEl) {
			return;
		}

		renderCaiplGraph(svgEl, nodes, edges, {
			selectedNodeId,
			graphMode,
			onNodeSelect: (nodeId) => dispatch('select', { nodeId })
		});
	}

	onMount(paint);
	afterUpdate(paint);
</script>

<div class="section-card p-3">
	<svg bind:this={svgEl} class="w-full" aria-label="CAILP plan graph"></svg>
</div>
