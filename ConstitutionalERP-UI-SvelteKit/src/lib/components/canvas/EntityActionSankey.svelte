<script lang="ts">
	import { afterUpdate, onMount } from 'svelte';
	import { renderEntityActionSankey } from '$lib/d3/entityActionSankeyRenderer';
	import type { EntityActionSankeyModel } from '$lib/types/hub';

	export let model: EntityActionSankeyModel;
	export let title = 'Entity Action Sankey';

	let svgEl: SVGSVGElement | undefined;

	function paint(): void {
		if (!svgEl) {
			return;
		}

		renderEntityActionSankey(svgEl, model);
	}

	onMount(paint);
	afterUpdate(paint);
</script>

<section class="glass-panel p-4">
	<h3 class="text-lg font-semibold">{title}</h3>
	<svg bind:this={svgEl} class="mt-3 w-full" aria-label="entity action sankey"></svg>
</section>
