<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { browser } from '$app/environment';
	import { themeStore } from '$lib/stores/themeStore';
	import {
		buildDiagramLabelMap,
		extractDiagramNodeSpecs,
		resolveDiagramNodeIdFromContent
	} from '$lib/diagrams/nodeResolution';

	export let definition: string;
	export let title = 'Diagram';
	export let fontSize = 16;
	export let showFullscreenToggle = true;
	/** When provided, entity/node clicks call this with the node's ID. */
	export let onNodeClick: ((nodeId: string) => void) | undefined = undefined;

	type MermaidApi = {
		initialize: (config: Record<string, unknown>) => void;
		render: (id: string, definition: string) => Promise<{ svg: string }>;
	};

	let svgHost: HTMLDivElement;
	let containerHost: HTMLDivElement;
	let svgHtml = '';
	let renderError = '';
	let isFullscreen = false;
	let cleanupClickBinding: (() => void) | null = null;

	async function ensureMermaidLoaded(): Promise<void> {
		if ((window as Window & { mermaid?: MermaidApi }).mermaid) {
			return;
		}
		await new Promise<void>((resolve, reject) => {
			const existing = document.querySelector<HTMLScriptElement>('script[data-mermaid-loader="true"]');
			if (existing) {
				existing.addEventListener('load', () => resolve(), { once: true });
				existing.addEventListener('error', () => reject(new Error('Unable to load Mermaid.')), { once: true });
				return;
			}
			const script = document.createElement('script');
			script.src = 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js';
			script.async = true;
			script.dataset.mermaidLoader = 'true';
			script.onload = () => resolve();
			script.onerror = () => reject(new Error('Unable to load Mermaid.'));
			document.head.appendChild(script);
		});
	}

	function resolveNodeIdFromGroup(group: SVGGElement, labelToId: Record<string, string>): string | null {
		return resolveDiagramNodeIdFromContent(group.textContent ?? '', labelToId);
	}

	function attachClickHandlers(definition: string) {
		if (!onNodeClick || !svgHost) return;
		cleanupClickBinding?.();

		const nodeSpecs = extractDiagramNodeSpecs(definition);
		if (nodeSpecs.length === 0) return;

		const labelToId = buildDiagramLabelMap(nodeSpecs);

		const allGroups = Array.from(svgHost.querySelectorAll('svg g')) as SVGGElement[];
		for (const group of allGroups) {
			if (resolveNodeIdFromGroup(group, labelToId)) {
				group.style.cursor = 'pointer';
			}
		}

		const onClick = (evt: MouseEvent) => {
			const target = evt.target as Element | null;
			if (!target) return;

			let current: Element | null = target;
			while (current && current !== svgHost) {
				if (current instanceof SVGGElement) {
					const nodeId = resolveNodeIdFromGroup(current, labelToId);
					if (nodeId) {
						onNodeClick?.(nodeId);
						return;
					}
				}
				current = current.parentElement;
			}
		};

		svgHost.addEventListener('click', onClick);
		cleanupClickBinding = () => {
			svgHost.removeEventListener('click', onClick);
		};
	}

	async function renderDiagram(): Promise<void> {
		if (!browser || !definition) return;
		renderError = '';
		try {
			await ensureMermaidLoaded();
			const mermaid = (window as Window & { mermaid?: MermaidApi }).mermaid;
			mermaid?.initialize({
				startOnLoad: false,
				securityLevel: 'loose',
				theme: $themeStore === 'light' ? 'default' : 'dark',
				themeVariables: {
					fontSize: `${fontSize}px`
				},
				sequence: {
					actorFontSize: fontSize,
					messageFontSize: fontSize,
					noteFontSize: fontSize
				}
			});
			const renderId = `mermaid-${Math.random().toString(36).slice(2, 10)}`;
			const result = await mermaid?.render(renderId, definition);
			if (result?.svg) {
				svgHtml = result.svg;
				await tick();
				attachClickHandlers(definition);
			}
		} catch (err) {
			renderError = err instanceof Error ? err.message : 'Failed to render diagram.';
		}
	}

	async function toggleFullscreen(): Promise<void> {
		if (!browser || !containerHost) {
			return;
		}

		if (document.fullscreenElement === containerHost) {
			await document.exitFullscreen();
			return;
		}

		await containerHost.requestFullscreen();
	}

	function syncFullscreenState(): void {
		if (!browser || !containerHost) {
			isFullscreen = false;
			return;
		}

		isFullscreen = document.fullscreenElement === containerHost;
	}

	onMount(() => {
		void renderDiagram();
		document.addEventListener('fullscreenchange', syncFullscreenState);
		return () => {
			cleanupClickBinding?.();
			cleanupClickBinding = null;
			document.removeEventListener('fullscreenchange', syncFullscreenState);
		};
	});

	$: {
		definition;
		fontSize;
		void renderDiagram();
	}
</script>

<div bind:this={containerHost} class="mermaid-shell rounded-xl border dark:border-white/25 border-slate-300 dark:bg-white/5 bg-white p-4">
	<div class="mb-2 flex items-center justify-between gap-2">
		<div class="text-sm font-semibold dark:text-slate-200 text-slate-700">{title}</div>
		{#if showFullscreenToggle}
			<button
				type="button"
				class="rounded border dark:border-white/25 dark:text-slate-200 dark:hover:bg-white/10 border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
				on:click={toggleFullscreen}
			>
				{isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
			</button>
		{/if}
	</div>
	{#if renderError}
		<p class="text-sm dark:text-red-300 text-red-700">{renderError}</p>
		<pre class="mt-3 overflow-x-auto rounded border dark:border-red-500/50 dark:bg-red-500/10 dark:text-red-200 border-red-300 bg-red-50 p-3 text-xs text-red-900">{definition}</pre>
	{:else}
		<div bind:this={svgHost} class="svghost overflow-auto" class:clickable-nodes={!!onNodeClick}>
			<!-- eslint-disable-next-line svelte/no-at-html-tags -->
			{@html svgHtml}
		</div>
	{/if}
</div>

<style>
	/* Scale SVG to fit its container */
	.svghost :global(svg) {
		max-width: 100%;
		height: auto;
	}
	:global(.mermaid-shell:fullscreen) {
		background: #ffffff;
		padding: 1rem;
	}
	:global(.mermaid-shell:fullscreen .svghost) {
		height: calc(100vh - 5.5rem);
	}
	:global(.mermaid-shell:fullscreen .svghost svg) {
		height: 100%;
		max-height: 100%;
	}
	/* Show pointer cursor on entity/node elements when click handlers are registered */
	.clickable-nodes :global(.er-entity),
	.clickable-nodes :global(.node),
	.clickable-nodes :global(.node rect),
	.clickable-nodes :global(.node circle),
	.clickable-nodes :global(.node polygon) {
		cursor: pointer;
	}
</style>
