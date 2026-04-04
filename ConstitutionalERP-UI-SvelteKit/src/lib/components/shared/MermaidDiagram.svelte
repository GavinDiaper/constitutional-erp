<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { browser } from '$app/environment';

	export let definition: string;
	export let title = 'Diagram';
	/** When provided, entity/node clicks call this with the node's ID. */
	export let onNodeClick: ((nodeId: string) => void) | undefined = undefined;

	type MermaidApi = {
		initialize: (config: Record<string, unknown>) => void;
		render: (id: string, definition: string) => Promise<{ svg: string }>;
	};

	type NodeSpec = {
		id: string;
		labels: string[];
	};

	let svgHost: HTMLDivElement;
	let svgHtml = '';
	let renderError = '';
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

	function extractNodeSpecs(def: string): NodeSpec[] {
		const seen: Record<string, true> = {};
		const result: NodeSpec[] = [];
		function add(id: string, label?: string) {
			if (!id) return;
			const labels = label && label !== id ? [id, label] : [id];

			if (Object.prototype.hasOwnProperty.call(seen, id)) {
				const existing = result.find((n) => n.id === id);
				if (existing) {
					for (const l of labels) {
						if (!existing.labels.includes(l)) existing.labels.push(l);
					}
				}
				return;
			}

			seen[id] = true;
			result.push({ id, labels });
		}

		if (/\berDiagram\b/.test(def)) {
			// Left-hand entity: 4-space-indented line whose first word precedes { or |
			const lhsRe = /^ {4}([A-Za-z]\w+)[ \t]*[{|]/gm;
			let m: RegExpExecArray | null;
			while ((m = lhsRe.exec(def)) !== null) add(m[1], m[1]);
			// Right-hand entity in a relationship: after o{ / }| etc. and before the label colon
			const rhsRe = /[|o<>}]{1,4}\s+(\w+)\s*:/g;
			while ((m = rhsRe.exec(def)) !== null) add(m[1], m[1]);
		} else {
			// flowchart nodes declared as Id[Label]
			const squareRe = /\b([A-Za-z_]\w*)\s*\[([^\]]+)\]/g;
			let m: RegExpExecArray | null;
			while ((m = squareRe.exec(def)) !== null) add(m[1], m[2].trim());
			// fallback for unlabeled nodes where ID is visible text
			const bareRe = /\b([A-Za-z_]\w*)\b(?=\s*-->|\s*:::|\s*$)/gm;
			while ((m = bareRe.exec(def)) !== null) add(m[1], m[1]);
		}

		return result;
	}

	function normalizeLabel(value: string): string {
		return value.replace(/\s+/g, ' ').trim();
	}

	function resolveNodeIdFromGroup(group: SVGGElement, labelToId: Record<string, string>): string | null {
		const content = normalizeLabel(group.textContent ?? '');
		if (!content) return null;

		const matchedIds: Record<string, true> = {};
		let matchCount = 0;
		for (const [label, id] of Object.entries(labelToId)) {
			if (content.includes(label)) {
				if (!Object.prototype.hasOwnProperty.call(matchedIds, id)) {
					matchedIds[id] = true;
					matchCount += 1;
				}
			}
		}

		if (matchCount === 1) {
			return Object.keys(matchedIds)[0];
		}

		return null;
	}

	function attachClickHandlers(nodeSpecs: NodeSpec[]) {
		if (!onNodeClick || !svgHost || nodeSpecs.length === 0) return;
		cleanupClickBinding?.();

		const labelToId: Record<string, string> = {};
		for (const spec of nodeSpecs) {
			for (const label of spec.labels) {
				labelToId[normalizeLabel(label)] = spec.id;
			}
		}

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
			mermaid?.initialize({ startOnLoad: false, securityLevel: 'loose', theme: 'default' });
			const renderId = `mermaid-${Math.random().toString(36).slice(2, 10)}`;
			const result = await mermaid?.render(renderId, definition);
			if (result?.svg) {
				svgHtml = result.svg;
				await tick();
				attachClickHandlers(extractNodeSpecs(definition));
			}
		} catch (err) {
			renderError = err instanceof Error ? err.message : 'Failed to render diagram.';
		}
	}

	onMount(() => {
		void renderDiagram();
		return () => {
			cleanupClickBinding?.();
			cleanupClickBinding = null;
		};
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
	/* Show pointer cursor on entity/node elements when click handlers are registered */
	.clickable-nodes :global(.er-entity),
	.clickable-nodes :global(.node),
	.clickable-nodes :global(.node rect),
	.clickable-nodes :global(.node circle),
	.clickable-nodes :global(.node polygon) {
		cursor: pointer;
	}
</style>
