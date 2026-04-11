<script lang="ts">
	import { afterUpdate, onMount } from 'svelte';
	import { renderCompactFlow } from '$lib/d3/compactFlowRenderer';
	import type { ProcessFlowDefinition } from '$lib/types/hub';

	export let flow: ProcessFlowDefinition | null = null;
	export let highlightedStepId: string | null = null;
	export let title = 'Flow Sequence';

	let svgEl: SVGSVGElement | undefined;

	function paint(): void {
		if (!svgEl) {
			return;
		}

		renderCompactFlow(svgEl, flow, { highlightedStepId });
	}

	onMount(paint);
	afterUpdate(paint);
</script>

<section class="rounded-lg border dark:border-white/20 border-slate-200 dark:bg-slate-950/25 bg-slate-100/60 p-3">
	<h4 class="text-sm font-semibold dark:text-slate-100 text-slate-700">{title}</h4>
	<svg bind:this={svgEl} class="mt-2 w-full" aria-label="compact flow graph"></svg>
</section>
