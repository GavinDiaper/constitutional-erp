<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import DiagramBreadcrumb from '$lib/components/shared/DiagramBreadcrumb.svelte';
	import MermaidDiagram from '$lib/components/shared/MermaidDiagram.svelte';
	import { diagramCatalog } from '$lib/diagrams/catalog';

	const systemDomainGroupingDefinition = `flowchart LR
	classDef foundation fill:#dbeafe,stroke:#1d4ed8,stroke-width:2px,color:#0f172a;
	classDef authority fill:#dcfce7,stroke:#15803d,stroke-width:2px,color:#0f172a;
	classDef governance fill:#fee2e2,stroke:#b91c1c,stroke-width:2px,color:#0f172a;
	classDef eventproc fill:#fff7ed,stroke:#c2410c,stroke-width:2px,color:#0f172a;
	classDef mesh fill:#ede9fe,stroke:#5b21b6,stroke-width:2px,color:#0f172a;
	classDef navigator fill:#fef9c3,stroke:#a16207,stroke-width:2px,color:#0f172a;
	classDef pge fill:#cffafe,stroke:#0f766e,stroke-width:2px,color:#0f172a;

	subgraph FoundationERP
		F_core[Core and Eventing]
		F_o2c[O2C Domain]
		F_p2p[P2P Domain]
		F_inv[Inventory Domain]
		F_r2r[R2R Domain + Tax]
		F_h2r[H2R Domain]
		F_nav[REPL and Navlog]
	end

	subgraph ConstitutionalLayer
		AE[Authority Engine]
		GE[Governance Engine]
		EP[Event Processor]
		MG[Mesh Gateway]
		NAI[Navigator AI]
		PGE[Process Graph Engine]
	end

	class F_core,F_o2c,F_p2p,F_inv,F_r2r,F_h2r,F_nav foundation;
	class AE authority;
	class GE governance;
	class EP eventproc;
	class MG mesh;
	class NAI navigator;
	class PGE pge;

	F_core --> AE
	F_core --> GE
	F_core --> EP
	F_core --> F_inv
	AE --> GE
	GE --> MG
	MG --> PGE
	EP --> NAI
	GE --> NAI
	F_inv --> F_r2r`;

	const grouped = {
		foundation: diagramCatalog.filter((d) => d.system === 'FoundationERP'),
		constitutional: diagramCatalog.filter((d) => d.system === 'ConstitutionalLayer'),
		cross: diagramCatalog.filter((d) => d.system === 'Cross-System')
	};

	const processFlowDomains: Array<{
		domain: 'o2c' | 'p2p' | 'r2r' | 'h2r';
		title: string;
		summary: string;
		accentClass: string;
	}> = [
		{
			domain: 'o2c',
			title: 'O2C Domain Process Flows',
			summary: 'Quote to cash process variants and step-level sequence details.',
			accentClass: 'border-indigo-500/40 bg-indigo-50/70'
		},
		{
			domain: 'p2p',
			title: 'P2P Domain Process Flows',
			summary: 'Procurement lifecycle variants from requisition through supplier payment.',
			accentClass: 'border-sky-500/40 bg-sky-50/70'
		},
		{
			domain: 'r2r',
			title: 'R2R Domain Process Flows',
			summary: 'Record to report process variants and journal-driven sequencing.',
			accentClass: 'border-blue-700/40 bg-blue-100/70'
		},
		{
			domain: 'h2r',
			title: 'H2R Domain Process Flows',
			summary: 'Employee lifecycle process variants across HR state transitions.',
			accentClass: 'border-cyan-600/40 bg-cyan-50/70'
		}
	];

	const overviewNodeLinks: Record<string, string> = {
		F_core: 'foundation-core-eventing',
		F_o2c: 'foundation-o2c',
		F_p2p: 'foundation-p2p',
		F_inv: 'foundation-inventory',
		F_r2r: 'foundation-r2r',
		F_h2r: 'foundation-h2r-navlog',
		F_nav: 'foundation-h2r-navlog',
		AE: 'authority-engine',
		GE: 'governance-engine',
		EP: 'event-processor',
		MG: 'mesh-gateway',
		NAI: 'navigator-ai',
		PGE: 'process-graph-engine'
	};

	function handleOverviewClick(nodeId: string) {
		const diagramId = overviewNodeLinks[nodeId];
		if (diagramId) {
			goto(resolve('/diagrams/[diagramId]', { diagramId }));
		}
	}
</script>

<DiagramBreadcrumb items={[{ label: 'Home', href: resolve('/') }, { label: 'Diagram Explorer' }]} />

<section class="rounded-2xl border dark:border-white/30 border-slate-300 dark:bg-white/80 bg-white/95 p-6 md:p-10">
	<h1 class="text-3xl font-semibold text-slate-900">Diagram Explorer</h1>
	<p class="mt-3 max-w-3xl text-sm text-slate-700">
		Open architecture diagrams and domain process flows from one landing page.
	</p>
	<div class="mt-4 flex flex-wrap gap-3 text-xs">
		<a class="rounded-md border border-slate-300 px-3 py-2 font-semibold text-slate-800 hover:bg-slate-100" href={resolve('/diagrams/process-flows')}>
			Browse All Domain Process Flows
		</a>
	</div>
	<div class="mt-5">
		<MermaidDiagram
			title="System and Domain Grouping (Color Key)"
			definition={systemDomainGroupingDefinition}
			onNodeClick={handleOverviewClick}
		/>
	</div>
</section>

<section class="mt-6 rounded-2xl border dark:border-white/30 border-slate-300 dark:bg-white/75 bg-white/90 p-6 md:p-8">
	<h2 class="text-xl font-semibold text-slate-900">Domain Process Flows</h2>
	<div class="mt-4 grid gap-3 sm:grid-cols-2">
		{#each processFlowDomains as flowDomain (flowDomain.domain)}
			<a
				class={`rounded-lg border p-4 transition hover:-translate-y-0.5 hover:shadow ${flowDomain.accentClass}`}
				href={resolve('/diagrams/process-flows/[domain]', { domain: flowDomain.domain })}
			>
				<p class="text-sm font-semibold text-slate-900">{flowDomain.title}</p>
				<p class="mt-2 text-xs text-slate-700">{flowDomain.summary}</p>
			</a>
		{/each}
	</div>
</section>

<section class="mt-6 rounded-2xl border dark:border-white/30 border-slate-300 dark:bg-white/75 bg-white/90 p-6 md:p-8">
	<h2 class="text-xl font-semibold text-slate-900">Architecture Diagrams: FoundationERP Domains</h2>
	<div class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
		{#each grouped.foundation as item (item.id)}
			<a class={`rounded-lg border p-4 transition hover:-translate-y-0.5 hover:shadow ${item.accentClass}`} href={resolve('/diagrams/[diagramId]', { diagramId: item.id })}>
				<p class="text-sm font-semibold text-slate-900">{item.title}</p>
				<p class="mt-2 text-xs text-slate-700">{item.summary}</p>
			</a>
		{/each}
	</div>
</section>

<section class="mt-6 rounded-2xl border dark:border-white/30 border-slate-300 dark:bg-white/75 bg-white/90 p-6 md:p-8">
	<h2 class="text-xl font-semibold text-slate-900">ConstitutionalLayer Systems</h2>
	<div class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
		{#each grouped.constitutional as item (item.id)}
			<a class={`rounded-lg border p-4 transition hover:-translate-y-0.5 hover:shadow ${item.accentClass}`} href={resolve('/diagrams/[diagramId]', { diagramId: item.id })}>
				<p class="text-sm font-semibold text-slate-900">{item.title}</p>
				<p class="mt-2 text-xs text-slate-700">{item.summary}</p>
			</a>
		{/each}
	</div>
</section>

<section class="mt-6 rounded-2xl border dark:border-white/30 border-slate-300 dark:bg-white/75 bg-white/90 p-6 md:p-8">
	<h2 class="text-xl font-semibold text-slate-900">Cross-System</h2>
	<div class="mt-4 grid gap-3 sm:grid-cols-2">
		{#each grouped.cross as item (item.id)}
			<a class={`rounded-lg border p-4 transition hover:-translate-y-0.5 hover:shadow ${item.accentClass}`} href={resolve('/diagrams/[diagramId]', { diagramId: item.id })}>
				<p class="text-sm font-semibold text-slate-900">{item.title}</p>
				<p class="mt-2 text-xs text-slate-700">{item.summary}</p>
			</a>
		{/each}
	</div>
</section>
