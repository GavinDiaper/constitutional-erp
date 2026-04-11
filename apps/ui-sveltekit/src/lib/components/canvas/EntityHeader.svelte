<script lang="ts">
	export let entityType: string;
	export let entityId: string;
	export let state: string;
</script>

<header class="glass-panel p-4">
	<p class="text-xs uppercase tracking-[0.2em] dark:text-white/70 text-slate-600">Entity</p>
	<h2 class="text-2xl font-semibold">{entityType} / {entityId}</h2>
	<p class="muted mt-1 text-sm">Current State: {state || 'unknown'}</p>
</header>
