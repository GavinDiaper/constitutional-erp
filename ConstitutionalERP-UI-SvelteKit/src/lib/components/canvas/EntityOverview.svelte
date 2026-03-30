<script lang="ts">
	export let attributes: Record<string, unknown> = {};
</script>

<section class="glass-panel p-4">
	<h3 class="text-lg font-semibold">Entity Overview</h3>
	{#if Object.keys(attributes).length === 0}
		<p class="muted mt-2 text-sm">No attributes available.</p>
	{:else}
		<dl class="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
			{#each Object.entries(attributes) as [key, value] (key)}
				<div class="rounded-md border border-white/10 bg-white/5 p-3">
					<dt class="text-xs uppercase tracking-[0.16em] text-white/65">{key}</dt>
					<dd class="mt-1 text-sm">{String(value)}</dd>
				</div>
			{/each}
		</dl>
	{/if}
</section>
