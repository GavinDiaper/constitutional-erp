<script lang="ts">
	export let title: string;
	export let value: string | number;
	export let href: string | null = null;
</script>

{#if href}
	<a
		href={href}
		class="glass-panel block p-4 transition-transform duration-150 hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 dark:focus-visible:outline-white focus-visible:outline-slate-700"
	>
		<p class="text-xs uppercase tracking-[0.2em] opacity-70">{title}</p>
		<p class="mt-2 text-3xl font-semibold">{value}</p>
	</a>
{:else}
	<article class="glass-panel p-4">
		<p class="text-xs uppercase tracking-[0.2em] opacity-70">{title}</p>
		<p class="mt-2 text-3xl font-semibold">{value}</p>
	</article>
{/if}
