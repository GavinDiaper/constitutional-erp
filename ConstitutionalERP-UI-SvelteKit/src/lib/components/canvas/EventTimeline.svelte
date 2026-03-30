<script lang="ts">
	import { afterUpdate, onMount } from 'svelte';
	import { renderEventTimeline } from '$lib/d3/eventTimelineRenderer';
	import type { TimelineEvent } from '$lib/types/hub';

	export let events: TimelineEvent[] = [];
	let svgEl: SVGSVGElement | undefined;

	function paint(): void {
		if (!svgEl) {
			return;
		}

		renderEventTimeline(svgEl, events);
	}

	onMount(paint);
	afterUpdate(paint);
</script>

<section class="glass-panel p-4">
	<h3 class="text-lg font-semibold">Event Timeline</h3>
	<svg bind:this={svgEl} class="mt-3 w-full" aria-label="event timeline"></svg>
</section>
