<script lang="ts">
	import { afterUpdate, onMount } from 'svelte';
	import type { CaiplPlanEdge, CaiplPlanNode } from '$lib/api/caipl';
	import { renderCaiplGraph } from '$lib/d3/caiplGraphRenderer';

	export let nodes: CaiplPlanNode[] = [];
	export let edges: CaiplPlanEdge[] = [];
	let svgEl: SVGSVGElement | undefined;

	function paint(): void {
		if (!svgEl) {
			return;
		}

		renderCaiplGraph(svgEl, nodes, edges);
	}

	onMount(paint);
	afterUpdate(paint);
</script>

<div class="section-card p-3">
	<svg bind:this={svgEl} class="w-full" aria-label="CAILP plan graph"></svg>
</div>
