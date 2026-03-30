<script lang="ts">
	import { afterUpdate, onMount } from 'svelte';
	import { renderProcessGraph } from '$lib/d3/processGraphRenderer';
	import type { ProcessGraphModel } from '$lib/types/hub';

	export let model: ProcessGraphModel;
	let svgEl: SVGSVGElement | undefined;

	function paint(): void {
		if (!svgEl) {
			return;
		}

		renderProcessGraph(svgEl, model);
	}

	onMount(paint);
	afterUpdate(paint);
</script>

<section class="glass-panel p-4">
	<h3 class="text-lg font-semibold">Process Graph</h3>
	<svg bind:this={svgEl} class="mt-3 w-full" aria-label="process graph"></svg>
</section>
