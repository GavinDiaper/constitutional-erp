<script lang="ts">
	import { onMount } from 'svelte';
	import './layout.css';
	import { resolve } from '$app/paths';
	import favicon from '$lib/assets/favicon.svg';
	import TopBar from '$lib/components/shared/TopBar.svelte';
	import Sidebar from '$lib/components/shared/Sidebar.svelte';

	let navigatorOpen = true;

	function toggleNavigator(): void {
		navigatorOpen = !navigatorOpen;
	}

	onMount(() => {
		const globalWindow = window as Window & {
			mermaid?: {
				initialize: (options: { startOnLoad: boolean; theme: string }) => void;
				contentLoaded: () => void;
			};
			__mermaidInitDone__?: boolean;
			__mermaidLoadPromise__?: Promise<void>;
		};

		if (!globalWindow.__mermaidLoadPromise__) {
			globalWindow.__mermaidLoadPromise__ = new Promise<void>((resolveLoad, rejectLoad) => {
				const existing = document.querySelector<HTMLScriptElement>('script[data-mermaid-layout-loader="true"]');
				if (existing) {
					if (globalWindow.mermaid) {
						resolveLoad();
						return;
					}
					existing.addEventListener('load', () => resolveLoad(), { once: true });
					existing.addEventListener('error', () => rejectLoad(new Error('Failed to load Mermaid script.')), {
						once: true
					});
					return;
				}

				const script = document.createElement('script');
				script.src = 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js';
				script.async = true;
				script.dataset.mermaidLayoutLoader = 'true';
				script.addEventListener('load', () => resolveLoad(), { once: true });
				script.addEventListener('error', () => rejectLoad(new Error('Failed to load Mermaid script.')), {
					once: true
				});
				document.head.appendChild(script);
			});
		}

		void globalWindow.__mermaidLoadPromise__
			.then(() => {
				if (!globalWindow.mermaid || globalWindow.__mermaidInitDone__) {
					return;
				}
				globalWindow.mermaid.initialize({ startOnLoad: true, theme: 'dark' });
				globalWindow.mermaid.contentLoaded();
				globalWindow.__mermaidInitDone__ = true;
			})
			.catch(() => {
				// Keep layout resilient even if Mermaid fails to load.
			});
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>ConstitutionalERP Canvas</title>
	<meta
		name="description"
		content="ConstitutionalERP SvelteKit canvas UI for process-first, graph-native operations."
	/>
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
