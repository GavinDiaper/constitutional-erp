<script lang="ts">
	import TopBar from '$lib/components/shared/TopBar.svelte';
	import Sidebar from '$lib/components/shared/Sidebar.svelte';
</script>

<TopBar />

<div class="grid gap-4 md:grid-cols-[240px_1fr]">
	<aside><Sidebar /></aside>
	<main class="space-y-4"><slot /></main>
</div>
