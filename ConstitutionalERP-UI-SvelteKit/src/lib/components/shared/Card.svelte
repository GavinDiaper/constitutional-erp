<script lang="ts">
	export let title: string;
	export let value: string | number;
</script>

<article class="glass-panel p-4">
	<p class="text-xs uppercase tracking-[0.2em] text-white/70">{title}</p>
	<p class="mt-2 text-3xl font-semibold">{value}</p>
</article>
