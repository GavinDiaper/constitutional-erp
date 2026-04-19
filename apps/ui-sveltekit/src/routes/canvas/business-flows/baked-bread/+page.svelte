<script lang="ts">
	import { resolve } from '$app/paths';

	interface FlowStage {
		id: string;
		title: string;
		domain: 'Projects' | 'P2P' | 'Inventory' | 'O2C';
		intent: string;
		outcome: string;
		actions: Array<{ label: string; href: string }>;
		checkpoints: string[];
	}

	const flowStages: FlowStage[] = [
		{
			id: '01',
			title: 'Profit Thesis And Product Setup',
			domain: 'Projects',
			intent: 'Capture the management decision to launch Fresh Bread as a governed initiative.',
			outcome: 'A project charter exists with expected margin, target volume, and completion criteria.',
			actions: [
				{ label: 'Open Projects Master', href: String(resolve('/projects')) },
				{ label: 'Open Project Canvas', href: String(resolve('/canvas/projects')) }
			],
			checkpoints: [
				'Project type set to internal manufacturing.',
				'WIP accounts selected for material and conversion costs.',
				'Finished item definition reserved as Fresh Bread SKU.'
			]
		},
		{
			id: '02',
			title: 'Recipe As BOM And Ingredient Sourcing',
			domain: 'P2P',
			intent: 'Treat the recipe as a BOM, then create demand for ingredients that are not on hand.',
			outcome: 'Requisitions and purchase orders are released and approved for flour, yeast, and packaging.',
			actions: [
				{ label: 'P2P Requisitions (Drafts)', href: String(resolve('/canvas/p2p/requisitions/drafts')) },
				{ label: 'P2P Requisitions (Submitted)', href: String(resolve('/canvas/p2p/requisitions/submitted')) },
				{ label: 'P2P Approved POs', href: String(resolve('/canvas/p2p/purchase-orders/approved')) }
			],
			checkpoints: [
				'BOM quantity basis aligned to expected loaf output.',
				'Supplier lead times captured for planning reliability.',
				'Policy approvals applied before PO release.'
			]
		},
		{
			id: '03',
			title: 'Production Execution And WIP Conversion',
			domain: 'Inventory',
			intent: 'Consume ingredients and transform project WIP into a stockable finished good.',
			outcome: 'Fresh Bread SKU inventory increases with traceable cost and movement references.',
			actions: [
				{ label: 'Open Inventory Console', href: String(resolve('/inventory')) },
				{ label: 'Open Canvas Inventory Entities', href: String(resolve('/canvas')) }
			],
			checkpoints: [
				'Ingredient issue movements reference project context.',
				'Finished goods receipts post against Fresh Bread SKU.',
				'Actual unit cost compared against target standard cost.'
			]
		},
		{
			id: '04',
			title: 'Customer Demand To Cash Realization',
			domain: 'O2C',
			intent: 'Capture customer orders for Fresh Bread and execute shipment and invoicing.',
			outcome: 'Revenue, margin, and sell-through can be measured against the original project thesis.',
			actions: [
				{ label: 'O2C Open Orders', href: String(resolve('/canvas/o2c/orders/open')) },
				{ label: 'O2C Open Invoices', href: String(resolve('/canvas/o2c/invoices/open')) },
				{ label: 'Canvas O2C Domain', href: String(resolve('/canvas')) }
			],
			checkpoints: [
				'Order promising checks against Fresh Bread on-hand.',
				'Shipment confirmation reduces inventory with audit trace.',
				'Invoice and cash collection complete the profitability loop.'
			]
		}
	];

	const northStarMetrics = [
		{ name: 'Gross Margin / Loaf', target: '>= 32%', why: 'Confirms commercial viability of the recipe and sourcing mix.' },
		{ name: 'Ingredient Stockout Rate', target: '< 2%', why: 'Prevents lost sales and production downtime.' },
		{ name: 'Order Fill Rate', target: '>= 97%', why: 'Measures service quality as demand scales.' },
		{ name: 'WIP To FG Cycle Time', target: '< 12h', why: 'Maintains freshness and reduces working capital drag.' }
	];
</script>

<section class="bread-flow-shell relative overflow-hidden rounded-2xl border border-amber-300/45 p-6 md:p-10">
	<div class="pointer-events-none absolute -left-16 top-10 h-48 w-48 rounded-full bg-amber-200/35 blur-2xl"></div>
	<div class="pointer-events-none absolute -right-10 bottom-6 h-56 w-56 rounded-full bg-orange-300/30 blur-2xl"></div>

	<div class="relative z-10">
		<p class="text-xs uppercase tracking-[0.18em] text-amber-900/80">Cross Domain Business Flow</p>
		<h1 class="mt-2 text-3xl font-semibold text-amber-950 md:text-4xl">Baked Bread Profit Flow</h1>
		<p class="mt-3 max-w-4xl text-sm leading-7 text-amber-950/80 md:text-base">
			This page operationalizes a single business story across Projects, P2P, Inventory, and O2C: management identifies demand for baked bread,
			the recipe is treated as BOM, ingredients are sourced, production converts WIP into Fresh Bread inventory, and customer demand is fulfilled to cash.
		</p>

		<div class="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
			{#each northStarMetrics as metric (metric.name)}
				<article class="rounded-xl border border-amber-700/20 bg-white/80 p-4 shadow-sm">
					<p class="text-xs uppercase tracking-wider text-amber-900/70">{metric.name}</p>
					<p class="mt-2 text-lg font-semibold text-amber-950">{metric.target}</p>
					<p class="mt-2 text-xs leading-5 text-amber-900/75">{metric.why}</p>
				</article>
			{/each}
		</div>
	</div>
</section>

<section class="mt-6 rounded-2xl border border-amber-300/50 bg-white/90 p-5 md:p-7">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<h2 class="text-2xl font-semibold text-amber-950">Execution Stages</h2>
		<a class="rounded-md border border-amber-800/30 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-100" href={resolve('/canvas')}>
			Back To Canvas Landing
		</a>
	</div>

	<div class="mt-5 grid gap-4 lg:grid-cols-2">
		{#each flowStages as stage (stage.id)}
			<article class="rounded-xl border border-amber-900/15 bg-gradient-to-br from-white to-amber-50/60 p-4 shadow-sm">
				<div class="flex items-start justify-between gap-3">
					<div>
						<p class="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-900/65">Stage {stage.id} • {stage.domain}</p>
						<h3 class="mt-1 text-lg font-semibold text-amber-950">{stage.title}</h3>
					</div>
				</div>

				<p class="mt-3 text-sm leading-6 text-amber-950/85"><span class="font-semibold">Intent:</span> {stage.intent}</p>
				<p class="mt-2 text-sm leading-6 text-amber-950/85"><span class="font-semibold">Outcome:</span> {stage.outcome}</p>

				<div class="mt-3 flex flex-wrap gap-2">
					{#each stage.actions as action (action.label)}
						<a class="rounded-md border border-amber-900/25 bg-amber-100/70 px-3 py-1.5 text-xs font-semibold text-amber-900 transition hover:-translate-y-0.5 hover:bg-amber-200/80" href={action.href}>
							{action.label}
						</a>
					{/each}
				</div>

				<ul class="mt-4 space-y-1.5 text-sm text-amber-950/80">
					{#each stage.checkpoints as checkpoint (checkpoint)}
						<li class="rounded-md bg-amber-950/5 px-2 py-1.5">{checkpoint}</li>
					{/each}
				</ul>
			</article>
		{/each}
	</div>
</section>

<section class="mt-6 rounded-2xl border border-amber-300/50 bg-white/90 p-5 md:p-7">
	<h2 class="text-xl font-semibold text-amber-950">UX Realization Pattern</h2>
	<p class="mt-3 text-sm leading-7 text-amber-950/80">
		For this scenario, treat each stage as a guided operating lane: user intent on the left, system status in the middle, and next action on the right.
		This keeps planners, buyers, and fulfillment users in one narrative while still entering the domain-specific canvases for execution.
	</p>
	<div class="mt-4 grid gap-3 md:grid-cols-3">
		<div class="rounded-lg border border-amber-900/20 bg-amber-50/75 p-4">
			<h3 class="text-sm font-semibold text-amber-950">Lane 1: Decide</h3>
			<p class="mt-2 text-xs leading-5 text-amber-900/80">Project charter, BOM baseline, margin hypothesis, and governance readiness.</p>
		</div>
		<div class="rounded-lg border border-amber-900/20 bg-amber-50/75 p-4">
			<h3 class="text-sm font-semibold text-amber-950">Lane 2: Execute</h3>
			<p class="mt-2 text-xs leading-5 text-amber-900/80">Requisition, PO, inventory movements, and production conversion to Fresh Bread.</p>
		</div>
		<div class="rounded-lg border border-amber-900/20 bg-amber-50/75 p-4">
			<h3 class="text-sm font-semibold text-amber-950">Lane 3: Realize</h3>
			<p class="mt-2 text-xs leading-5 text-amber-900/80">Sales orders, shipment, invoicing, and margin confirmation against project thesis.</p>
		</div>
	</div>
</section>

<style>
	.bread-flow-shell {
		background: linear-gradient(148deg, rgba(255, 248, 230, 0.98), rgba(255, 237, 213, 0.9));
		box-shadow: 0 20px 44px rgba(120, 53, 15, 0.15);
	}
</style>