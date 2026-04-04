<script lang="ts">
	import { onMount } from 'svelte';

	export let definition: string;
	export let title = 'Diagram';

	type MermaidApi = {
		initialize: (config: Record<string, unknown>) => void;
		render: (id: string, definition: string) => Promise<{ svg: string }>;
	};

	let renderedImageSrc = '';
	let renderError = '';

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

	async function renderDiagram(): Promise<void> {
		if (!definition) {
			return;
		}

		renderError = '';
		try {
			await ensureMermaidLoaded();
			const mermaid = (window as Window & { mermaid?: MermaidApi }).mermaid;
			mermaid?.initialize({
				startOnLoad: false,
				securityLevel: 'loose',
				theme: 'default'
			});
			const renderId = `mermaid-${Math.random().toString(36).slice(2, 10)}`;
			const result = await mermaid?.render(renderId, definition);
			renderedImageSrc = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(result?.svg ?? '')}`;
		} catch (error) {
			renderError = error instanceof Error ? error.message : 'Failed to render diagram.';
		}
	}

	onMount(async () => {
		await renderDiagram();
	});

	$: if (definition) {
		void renderDiagram();
	}
</script>

<div class="rounded-xl border border-slate-300 bg-white p-4">
	<div class="mb-2 text-sm font-semibold text-slate-700">{title}</div>
	{#if renderError}
		<p class="text-sm text-red-700">{renderError}</p>
		<pre class="mt-3 overflow-x-auto rounded border border-red-300 bg-red-50 p-3 text-xs text-red-900">{definition}</pre>
	{:else}
		<img class="max-w-none" src={renderedImageSrc} alt={title} />
	{/if}
</div>
