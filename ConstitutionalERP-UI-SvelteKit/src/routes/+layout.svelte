<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>ConstitutionalERP Canvas</title>
	<meta
		name="description"
		content="ConstitutionalERP SvelteKit canvas UI for process-first, graph-native operations."
	/>
</svelte:head>

<div class="page-shell"><slot /></div>
