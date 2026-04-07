<script lang="ts">
	import './layout.css';
	import { resolve } from '$app/paths';
	import favicon from '$lib/assets/favicon.svg';
	import TopBar from '$lib/components/shared/TopBar.svelte';
	import Sidebar from '$lib/components/shared/Sidebar.svelte';

	let navigatorOpen = true;

	function toggleNavigator(): void {
		navigatorOpen = !navigatorOpen;
	}
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>ConstitutionalERP Canvas</title>
	<meta
		name="description"
		content="ConstitutionalERP SvelteKit canvas UI for process-first, graph-native operations."
	/>
	<script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js" async></script>
	<script>
		// Initialize Mermaid after it loads
		const initMermaid = () => {
			if (typeof window !== 'undefined' && window.mermaid) {
				window.mermaid.initialize({ startOnLoad: true, theme: 'dark' });
				window.mermaid.contentLoaded();
			}
		};
		
		// Try immediately
		if (document.readyState === 'loading') {
			document.addEventListener('DOMContentLoaded', initMermaid);
		} else {
			initMermaid();
		}
	</script>
</svelte:head>
<div class="page-shell">
	<TopBar />

	<div class="mb-3 flex flex-wrap items-center gap-2">
		<button
			type="button"
			class="rounded-md border border-white/30 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/20"
			on:click={toggleNavigator}
		>
			{navigatorOpen ? 'Collapse Navigator' : 'Expand Navigator'}
		</button>
		<a class="rounded-md border border-white/30 px-3 py-1.5 text-xs text-white/85 hover:bg-white/10" href={resolve('/canvas')}>
			Canvas
		</a>
		<a class="rounded-md border border-white/30 px-3 py-1.5 text-xs text-white/85 hover:bg-white/10" href={resolve('/navigator/sessions')}>
			Navigator Sessions
		</a>
	</div>

	<div class={`app-shell-grid ${navigatorOpen ? 'app-shell-grid--nav' : 'app-shell-grid--full'}`}>
		{#if navigatorOpen}
			<aside class="min-w-0"><Sidebar /></aside>
		{/if}
		<main class="min-w-0 space-y-4"><slot /></main>
	</div>
</div>

<style>
	.app-shell-grid {
		display: grid;
		gap: 1rem;
	}

	.app-shell-grid--nav {
		grid-template-columns: minmax(220px, 260px) minmax(0, 1fr);
	}

	.app-shell-grid--full {
		grid-template-columns: minmax(0, 1fr);
	}

	@media (max-width: 860px) {
		.app-shell-grid--nav,
		.app-shell-grid--full {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
