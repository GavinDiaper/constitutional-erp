<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
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
		F_r2r[R2R Domain]
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

	class F_core,F_o2c,F_p2p,F_r2r,F_h2r,F_nav foundation;
	class AE authority;
	class GE governance;
	class EP eventproc;
	class MG mesh;
	class NAI navigator;
	class PGE pge;

	F_core --> AE
	F_core --> GE
	F_core --> EP
	AE --> GE
	GE --> MG
	MG --> PGE
	EP --> NAI
	GE --> NAI`;

	const grouped = {
		foundation: diagramCatalog.filter((d) => d.system === 'FoundationERP'),
		constitutional: diagramCatalog.filter((d) => d.system === 'ConstitutionalLayer'),
		cross: diagramCatalog.filter((d) => d.system === 'Cross-System')
	};

	const overviewNodeLinks: Record<string, string> = {
		F_core: 'foundation-core-eventing',
		F_o2c: 'foundation-o2c',
		F_p2p: 'foundation-p2p',
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

<section class="rounded-2xl border border-white/30 bg-white/80 p-6 md:p-10">
	<h1 class="text-3xl font-semibold text-slate-900">Architecture Diagram Explorer</h1>
	<p class="mt-3 max-w-3xl text-sm text-slate-700">
		Select a box to open the dedicated diagram page for that system or domain.
	</p>
	<div class="mt-5">
		<MermaidDiagram
			title="System and Domain Grouping (Color Key)"
			definition={systemDomainGroupingDefinition}
			onNodeClick={handleOverviewClick}
		/>
	</div>
</section>

<section class="mt-6 rounded-2xl border border-white/30 bg-white/75 p-6 md:p-8">
	<h2 class="text-xl font-semibold text-slate-900">FoundationERP Domains</h2>
	<div class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
		{#each grouped.foundation as item (item.id)}
			<a class={`rounded-lg border p-4 transition hover:-translate-y-0.5 hover:shadow ${item.accentClass}`} href={resolve('/diagrams/[diagramId]', { diagramId: item.id })}>
				<p class="text-sm font-semibold text-slate-900">{item.title}</p>
				<p class="mt-2 text-xs text-slate-700">{item.summary}</p>
			</a>
		{/each}
	</div>
</section>

<section class="mt-6 rounded-2xl border border-white/30 bg-white/75 p-6 md:p-8">
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

<section class="mt-6 rounded-2xl border border-white/30 bg-white/75 p-6 md:p-8">
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
