<script lang="ts">
	import { resolve } from '$app/paths';
	import DiagramBreadcrumb from '$lib/components/shared/DiagramBreadcrumb.svelte';
	import MermaidDiagram from '$lib/components/shared/MermaidDiagram.svelte';
	import { getProcessFlowBundle, getDefaultFlowForDomain, listFlowsByDomain } from '$lib/flows';
	import type { ProcessFlowDefinition } from '$lib/types/hub';
	import type { PageData } from './$types';

	export let data: PageData;

	type FlowViewMode = 'mermaid' | 'list' | 'hidden';

	const flowBundle = getProcessFlowBundle();
	const domainLinks = [
		{ slug: 'o2c', label: 'O2C' },
		{ slug: 'p2p', label: 'P2P' },
		{ slug: 'r2r', label: 'R2R' },
		{ slug: 'h2r', label: 'H2R' }
	] as const;

	let selectedVariantKey = getDefaultFlowForDomain(data.domain)?.variantKey ?? 'base';
	let selectedFlowViewMode: FlowViewMode = 'list';

	function summarizeNode(node: ProcessFlowDefinition['nodes'][number]): string {
		const parts = [`${node.httpMethod} ${node.requestPath}`];
		if (node.dependsOnVariables.length > 0) {
			parts.push(`in: ${node.dependsOnVariables.join(', ')}`);
		}
		if (node.capturesVariables.length > 0) {
			parts.push(`out: ${node.capturesVariables.join(', ')}`);
		}

		return parts.join(' • ');
	}

	function sanitizeMermaidLabel(value: string): string {
		return value.replace(/"/g, '\\"').replace(/\|/g, '/').trim();
	}

	function buildFlowMermaidDefinition(flow: ProcessFlowDefinition | null): string {
		if (!flow || flow.nodes.length === 0) {
			return 'sequenceDiagram\n  Note over System: No flow available';
		}

		const lines: string[] = ['sequenceDiagram'];
		const refById = new Map<string, string>();

		for (const node of flow.nodes) {
			const ref = `P${node.sequence}`;
			refById.set(node.id, ref);
			lines.push(`  participant ${ref} as "${sanitizeMermaidLabel(`${node.sequence}. ${node.requestName}`)}"`);
		}

		if (flow.nodes.length === 1) {
			const onlyRef = refById.get(flow.nodes[0]?.id ?? '');
			if (onlyRef) {
				lines.push(`  ${onlyRef}->>${onlyRef}: ${sanitizeMermaidLabel(flow.nodes[0].action || 'step')}`);
			}
		} else if (flow.edges.length > 0) {
			for (const edge of flow.edges) {
				const sourceRef = refById.get(edge.sourceId);
				const targetRef = refById.get(edge.targetId);
				if (!sourceRef || !targetRef) {
					continue;
				}
				const label = sanitizeMermaidLabel(edge.condition || 'next');
				lines.push(`  ${sourceRef}->>${targetRef}: ${label}`);
			}
		} else {
			for (let index = 1; index < flow.nodes.length; index += 1) {
				lines.push(`  P${index}->>P${index + 1}: next`);
			}
		}

		return lines.join('\n');
	}

	$: flowsForDomain = listFlowsByDomain(data.domain);
	$: selectedFlow =
		flowsForDomain.find((flow) => flow.variantKey === selectedVariantKey) ?? flowsForDomain[0] ?? null;
	$: selectedFlowMermaid = buildFlowMermaidDefinition(selectedFlow);
</script>

<DiagramBreadcrumb
	items={[
		{ label: 'Home', href: resolve('/') },
		{ label: 'Diagram Explorer', href: resolve('/diagrams') },
		{ label: 'Domain Process Flows', href: resolve('/diagrams/process-flows') },
		{ label: data.domain }
	]}
/>

<section class="rounded-2xl border dark:border-white/30 border-slate-300 dark:bg-white/80 bg-white/95 p-6 md:p-10">
	<p class="text-xs uppercase tracking-[0.18em] text-slate-600">Diagram Explorer</p>
	<h1 class="mt-2 text-3xl font-semibold text-slate-900">{data.domain} Domain Process Flow</h1>
	<p class="mt-3 max-w-3xl text-sm text-slate-700">
		Generated from FoundationERP Postman end-to-end folders. Select a variant to inspect step-by-step process behavior.
	</p>
	<div class="mt-5 flex flex-wrap gap-2">
		{#each domainLinks as domainLink (domainLink.slug)}
			<a
				class={`rounded-md border px-3 py-1 text-xs font-semibold ${domainLink.slug === data.slug ? 'border-slate-800 bg-slate-800 dark:text-white text-slate-900' : 'border-slate-300 text-slate-700 hover:bg-slate-100'}`}
				href={resolve('/diagrams/process-flows/[domain]', { domain: domainLink.slug })}
			>
				{domainLink.label}
			</a>
		{/each}
	</div>
	<div class="mt-4 flex gap-3">
		<a class="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-100" href={resolve('/diagrams/process-flows')}>
			All Domain Flows
		</a>
		<a class="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-100" href={resolve('/diagrams')}>
			Diagram Explorer Landing
		</a>
	</div>
</section>

<section class="mt-6 rounded-2xl border dark:border-white/30 border-slate-300 dark:bg-white/75 bg-white/90 p-6 md:p-8">
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div>
			<h2 class="text-xl font-semibold text-slate-900">Flow Variants</h2>
			<p class="mt-1 text-xs text-slate-600">{flowBundle.flows.length} generated flows across all domains</p>
		</div>
	</div>

	{#if flowsForDomain.length === 0}
		<p class="mt-4 text-sm text-slate-700">No generated flow is available for this domain yet.</p>
	{:else}
		<div class="mt-4 flex flex-wrap gap-2 text-xs">
			{#each flowsForDomain as flow (flow.id)}
				<button
					type="button"
					class={`rounded-md border px-2 py-1 ${selectedFlow?.id === flow.id ? 'border-slate-800 bg-slate-800 dark:text-white text-slate-900' : 'border-slate-300 text-slate-700 hover:bg-slate-100'}`}
					on:click={() => (selectedVariantKey = flow.variantKey)}
				>
					{flow.variantLabel}
				</button>
			{/each}
		</div>

		{#if selectedFlow}
			<p class="mt-3 text-xs text-slate-600">{selectedFlow.sourceFolderName} • {selectedFlow.nodes.length} steps</p>
			<div class="mt-3 flex flex-wrap gap-2 text-xs">
				<button
					type="button"
					class={`rounded-md border px-2 py-1 ${selectedFlowViewMode === 'mermaid' ? 'border-slate-800 bg-slate-800 dark:text-white text-slate-900' : 'border-slate-300 text-slate-700 hover:bg-slate-100'}`}
					on:click={() => (selectedFlowViewMode = 'mermaid')}
				>
					Mermaid diagram
				</button>
				<button
					type="button"
					class={`rounded-md border px-2 py-1 ${selectedFlowViewMode === 'list' ? 'border-slate-800 bg-slate-800 dark:text-white text-slate-900' : 'border-slate-300 text-slate-700 hover:bg-slate-100'}`}
					on:click={() => (selectedFlowViewMode = 'list')}
				>
					List view
				</button>
				<button
					type="button"
					class={`rounded-md border px-2 py-1 ${selectedFlowViewMode === 'hidden' ? 'border-slate-800 bg-slate-800 dark:text-white text-slate-900' : 'border-slate-300 text-slate-700 hover:bg-slate-100'}`}
					on:click={() => (selectedFlowViewMode = 'hidden')}
				>
					Hide flow
				</button>
			</div>

			{#if selectedFlowViewMode === 'hidden'}
				<p class="mt-3 text-xs text-slate-600">Flow display is hidden for this domain.</p>
			{:else if selectedFlowViewMode === 'mermaid'}
				<div class="mt-3 rounded border border-slate-200 dark:bg-white dark:text-slate-900 bg-slate-900 text-white p-2">
					<MermaidDiagram definition={selectedFlowMermaid} title={`${data.domain} flow diagram`} fontSize={44} />
				</div>
			{:else}
				<ol class="mt-3 space-y-2 text-sm">
					{#each selectedFlow.nodes as node (node.id)}
						<li class="rounded border border-slate-200 dark:bg-white dark:text-slate-900 bg-slate-900 text-white px-3 py-2">
							<div class="flex flex-wrap items-center justify-between gap-2">
								<span class="font-semibold text-slate-900">{node.sequence}. {node.requestName}</span>
								<span class="rounded bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700">{node.action}</span>
							</div>
							<p class="mt-1 text-xs text-slate-600">{summarizeNode(node)}</p>
						</li>
					{/each}
				</ol>
			{/if}
		{/if}
	{/if}
</section>
