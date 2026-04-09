<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { fetchAggregateIds } from '$lib/api/aggregates';
	import { getMcpFunctions } from '$lib/api/mcp';
	import { getActions, getResource, type CanonicalResource } from '$lib/api/navigator';
	import EntityActionSankey from '$lib/components/canvas/EntityActionSankey.svelte';
	import {
		buildEntityActionSankeyModel,
		buildInteractiveAggregateDrilldownSankeyModel,
		buildInteractiveDomainDrilldownSankeyModel
	} from '$lib/flows/sankey';
	import { actorStore } from '$lib/stores/actorStore';
	import type { EntityActionSankeyLink, EntityActionSankeyModel, EntityActionSankeyNode } from '$lib/types/hub';

	let isLoadingSankey = false;
	let sankeyError = '';
	let mcpFunctionCount = 0;
	type TopologyTab = 'diagram' | 'interactive-map';
	type InteractiveMapMode = 'root' | 'domain-focused' | 'aggregate-focused';
	let activeTopologyTab: TopologyTab = 'diagram';
	let interactiveMapMode: InteractiveMapMode = 'root';
	let selectedInteractiveDomain = '';
	let selectedInteractiveAggregate = '';
	let interactiveNodeTooltipById: Record<string, string> = {};
	let sankeyModel: EntityActionSankeyModel = {
		nodes: [],
		links: []
	};
	let interactiveMapModel: EntityActionSankeyModel = {
		nodes: [],
		links: []
	};

	onMount(() => {
		const unsubscribeActor = actorStore.subscribe(() => {
			void loadSankeyData();
		});

		void loadSankeyData();

		return () => {
			unsubscribeActor();
		};
	});

	async function loadSankeyData(): Promise<void> {
		isLoadingSankey = true;
		sankeyError = '';

		try {
			const actor = $actorStore;
			const result = await getMcpFunctions(actor);
			const functions = result.data ?? [];
			mcpFunctionCount = functions.length;
			const aggregateIds = await fetchAggregateIds(functions, actor);
			sankeyModel = buildEntityActionSankeyModel(functions, aggregateIds);
			interactiveNodeTooltipById = {};
			resetInteractiveMap();
		} catch (error) {
			sankeyError = error instanceof Error ? error.message : 'Unable to load Sankey source data.';
			sankeyModel = { nodes: [], links: [] };
			interactiveMapModel = { nodes: [], links: [] };
			interactiveNodeTooltipById = {};
			selectedInteractiveDomain = '';
			selectedInteractiveAggregate = '';
			interactiveMapMode = 'root';
		} finally {
			isLoadingSankey = false;
		}
	}

	function toSingleLine(value: unknown): string | null {
		if (typeof value === 'string') {
			const normalized = value.trim().replace(/\s+/g, ' ');
			return normalized.length > 0 ? normalized : null;
		}

		if (typeof value === 'number' || typeof value === 'boolean') {
			return String(value);
		}

		return null;
	}

	function firstHeaderValue(attributes: Record<string, unknown>, keys: string[]): string | null {
		for (const key of keys) {
			const value = toSingleLine(attributes[key]);
			if (value) {
				return value;
			}
		}

		return null;
	}

	function derivePrimaryName(attributes: Record<string, unknown>): string | null {
		const explicitName = firstHeaderValue(attributes, [
			'customer_name',
			'customerName',
			'supplier_name',
			'supplierName',
			'employee_name',
			'employeeName',
			'vendor_name',
			'vendorName',
			'full_name',
			'fullName',
			'display_name',
			'displayName',
			'name'
		]);
		if (explicitName) {
			return explicitName;
		}

		const namedEntry = Object.entries(attributes).find(([key, value]) =>
			key.toLowerCase().includes('name') && toSingleLine(value)
		);

		return namedEntry ? toSingleLine(namedEntry[1]) : null;
	}

	function buildInstanceTooltip(meta: { domain: string; entity: string; aggregateId: string }, resource: CanonicalResource): string {
		const attributes = resource.attributes ?? {};
		const lines: string[] = [
			`${meta.entity} ${meta.aggregateId}`,
			`Domain: ${meta.domain}`,
			`Status: ${toSingleLine(resource.state) ?? firstHeaderValue(attributes, ['status', 'state', 'lifecycle_state', 'process_state']) ?? 'Unknown'}`
		];

		const primaryName = derivePrimaryName(attributes);
		if (primaryName) {
			lines.push(`Name: ${primaryName}`);
		}

		const secondaryDetails: Array<[string, string | null]> = [
			['Email', firstHeaderValue(attributes, ['email', 'email_address'])],
			['Code', firstHeaderValue(attributes, ['code', 'customer_code', 'supplier_code', 'employee_code'])],
			['Owner', firstHeaderValue(attributes, ['owner_name', 'owner'])]
		];

		for (const [label, value] of secondaryDetails) {
			if (value) {
				lines.push(`${label}: ${value}`);
			}
		}

		lines.push('Click to open Canvas');
		return lines.join('\n');
	}

	function getInteractiveMapNodeTooltip(node: EntityActionSankeyNode): string {
		const enriched = interactiveNodeTooltipById[node.id];
		if (enriched) {
			return enriched;
		}

		if (node.id.startsWith('instance:')) {
			const meta = parseInstanceNodeId(node.id);
			if (meta) {
				return `${meta.entity} ${meta.aggregateId}\nDomain: ${meta.domain}\nHeader details are loading...`;
			}
		}

		if (interactiveMapMode === 'root') {
			return `${node.label}\nClick to drill into aggregate types`;
		}

		if (interactiveMapMode === 'domain-focused') {
			return `${node.label}\nClick to drill into aggregate IDs`;
		}

		if (interactiveMapMode === 'aggregate-focused' && node.id.startsWith('action:')) {
			return `${node.label}\nAction available for selected aggregate IDs`;
		}

		return node.label;
	}

	function normalizeToken(value: string): string {
		return value.replace(/[^a-z0-9]/gi, '').toLowerCase();
	}

	function parseInstanceNodeId(nodeId: string): { domain: string; entity: string; aggregateId: string } | null {
		if (!nodeId.startsWith('instance:')) {
			return null;
		}

		const content = nodeId.slice('instance:'.length);
		const segments = content.split('|');
		if (segments.length < 3) {
			return null;
		}

		const domain = segments[0]?.trim();
		const aggregateId = segments[segments.length - 1]?.trim();
		const entity = segments.slice(1, segments.length - 1).join('|').trim();

		if (!domain || !entity || !aggregateId) {
			return null;
		}

		return { domain, entity, aggregateId };
	}

	function parseActionNodeId(nodeId: string): { domain: string; entity: string; action: string } | null {
		if (!nodeId.startsWith('action:')) {
			return null;
		}

		const content = nodeId.slice('action:'.length);
		const segments = content.split('|');
		if (segments.length < 3) {
			return null;
		}

		const domain = segments[0]?.trim();
		const action = segments[segments.length - 1]?.trim();
		const entity = segments.slice(1, segments.length - 1).join('|').trim();

		if (!domain || !entity || !action) {
			return null;
		}

		return { domain, entity, action };
	}

	function toCanvasEntityType(domain: string, entity: string): string {
		const normalizedEntity = entity
			.trim()
			.replace(/([a-z0-9])([A-Z])/g, '$1_$2')
			.replace(/[^a-zA-Z0-9]+/g, '_')
			.replace(/^_+|_+$/g, '')
			.toLowerCase();

		return `${domain.toLowerCase()}_${normalizedEntity}`;
	}

	async function applyAllowedActionLinkHighlights(
		model: EntityActionSankeyModel
	): Promise<{ model: EntityActionSankeyModel; tooltips: Record<string, string> }> {
		const instanceNodes = model.nodes.filter((node) => node.id.startsWith('instance:'));
		if (instanceNodes.length === 0) {
			return {
				model,
				tooltips: {}
			};
		}

		const allowedByInstance = new Map<string, Set<string>>();
		const tooltips: Record<string, string> = {};
		await Promise.all(
			instanceNodes.map(async (node) => {
				const meta = parseInstanceNodeId(node.id);
				if (!meta) {
					return;
				}

				try {
					const context = {
						domain: meta.domain,
						aggregateType: meta.entity,
						aggregateId: meta.aggregateId,
						actorId: $actorStore.actorId
					};
					const [actions, resource] = await Promise.all([
						getActions(context, $actorStore),
						getResource(context, $actorStore).catch(() => null)
					]);

					const actionSet = new Set(actions.map((action) => normalizeToken(action.id)));
					allowedByInstance.set(node.id, actionSet);

					if (resource) {
						tooltips[node.id] = buildInstanceTooltip(meta, resource);
					}
				} catch {
					// Keep default rendering when action availability cannot be resolved.
				}
			})
		);

		const links: EntityActionSankeyLink[] = model.links.map((link) => {
			if (!link.source.startsWith('instance:') || !link.target.startsWith('action:')) {
				return { ...link };
			}

			const actionMeta = parseActionNodeId(link.target);
			const allowedActions = allowedByInstance.get(link.source);
			const isAllowed = !!(actionMeta && allowedActions?.has(normalizeToken(actionMeta.action)));

			return {
				...link,
				isAllowed
			};
		});

		return {
			model: { nodes: model.nodes, links },
			tooltips
		};
	}

	async function handleInteractiveNodeClick(node: EntityActionSankeyNode): Promise<void> {
		if (interactiveMapMode === 'root') {
			if (node.level !== 0 || !node.id.startsWith('domain:')) {
				return;
			}

			selectedInteractiveDomain = node.label;
			selectedInteractiveAggregate = '';
			interactiveNodeTooltipById = {};
			interactiveMapModel = buildInteractiveDomainDrilldownSankeyModel(sankeyModel, selectedInteractiveDomain);
			interactiveMapMode = 'domain-focused';
			return;
		}

		if (interactiveMapMode === 'domain-focused') {
			if (node.level !== 0 || !node.id.startsWith('aggregate:')) {
				return;
			}

			selectedInteractiveAggregate = node.label;
			const aggregateModel = buildInteractiveAggregateDrilldownSankeyModel(sankeyModel, node.id);
			const highlighted = await applyAllowedActionLinkHighlights(aggregateModel);
			interactiveMapModel = highlighted.model;
			interactiveNodeTooltipById = highlighted.tooltips;
			interactiveMapMode = 'aggregate-focused';
			return;
		}

		if (interactiveMapMode === 'aggregate-focused') {
			if (node.level !== 1 || !node.id.startsWith('instance:')) {
				return;
			}

			const meta = parseInstanceNodeId(node.id);
			if (!meta) {
				return;
			}

			const entityType = toCanvasEntityType(meta.domain, meta.entity);
			await goto(resolve(`/canvas/${entityType}/${encodeURIComponent(meta.aggregateId)}`));
		}
	}

	$: interactiveMapClickableLevels =
		interactiveMapMode === 'root' ? [0] : interactiveMapMode === 'domain-focused' ? [0] : [1];

	function resetInteractiveMap(): void {
		selectedInteractiveDomain = '';
		selectedInteractiveAggregate = '';
		interactiveNodeTooltipById = {};
		interactiveMapMode = 'root';
		interactiveMapModel = sankeyModel;
	}
</script>

<h2 class="text-2xl font-semibold">Admin Dashboard</h2>
<p class="muted mt-2 text-sm">Admin dashboards and inspectors for governance, events, and accounting drilldowns.</p>

<div class="mt-4 flex flex-wrap gap-2">
	<a class="rounded-md border border-white/35 px-3 py-2 text-xs text-white hover:bg-white/10" href={resolve('/admin/create-entities')}>Open Create Admin Entities</a>
	<a class="rounded-md border border-white/35 px-3 py-2 text-xs text-white hover:bg-white/10" href={resolve('/admin/events')}>Open Event Stream Viewer</a>
	<a class="rounded-md border border-white/35 px-3 py-2 text-xs text-white hover:bg-white/10" href={resolve('/admin/r2r/trial-balance')}>Open R2R Trial Balance</a>
	<a class="rounded-md border border-white/35 px-3 py-2 text-xs text-white hover:bg-white/10" href={resolve('/admin/r2r/ledger-entries')}>Open R2R Ledger Entries</a>
	<a class="rounded-md border border-white/35 px-3 py-2 text-xs text-white hover:bg-white/10" href={resolve('/admin/r2r/tax-summary')}>Open R2R Tax Summary</a>
	<a class="rounded-md border border-white/35 px-3 py-2 text-xs text-white hover:bg-white/10" href={resolve('/admin/r2r/vat-report')}>Open R2R VAT Report</a>
	<a class="rounded-md border border-white/35 px-3 py-2 text-xs text-white hover:bg-white/10" href={resolve('/admin/r2r/withholding-tax')}>Open R2R Withholding Tax</a>
</div>

<div class="mt-6 border-t border-white/10 pt-4">
	<h3 class="mb-3 text-xs uppercase tracking-[0.15em] text-white/70">Navigator</h3>
	<div class="flex flex-wrap gap-2">
		<a class="rounded-md border border-white/35 px-3 py-2 text-xs text-white hover:bg-white/10" href={resolve('/navigator/sessions')}>Open Navigator Sessions</a>
	</div>
</div>

<div class="mt-8 border-t border-white/10 pt-6">
	<h3 class="text-xl font-semibold">System Entity Action Topology</h3>
	<p class="muted mt-2 text-sm">
		D3 Sankey showing domain → aggregate type → live instance ID → action. Create operations link directly from type to action (no instance ID). Each parent splits equally across its outgoing paths.
	</p>

	<div class="mt-4 inline-flex rounded-lg border border-white/20 bg-white/5 p-1" role="tablist" aria-label="Topology views">
		<button
			type="button"
			class={`rounded-md px-3 py-1.5 text-xs transition ${activeTopologyTab === 'diagram' ? 'bg-white/20 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}
			role="tab"
			aria-selected={activeTopologyTab === 'diagram'}
			on:click={() => {
				activeTopologyTab = 'diagram';
			}}
		>
			Diagram
		</button>
		<button
			type="button"
			class={`rounded-md px-3 py-1.5 text-xs transition ${activeTopologyTab === 'interactive-map' ? 'bg-white/20 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}
			role="tab"
			aria-selected={activeTopologyTab === 'interactive-map'}
			on:click={() => {
				activeTopologyTab = 'interactive-map';
			}}
		>
			Interactive Map
		</button>
	</div>

	{#if isLoadingSankey}
		<p class="mt-4 rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm text-white/80">Loading Sankey data...</p>
	{:else if sankeyError}
		<p class="mt-4 rounded-md border border-red-400/40 bg-red-900/20 px-3 py-2 text-sm text-red-100">{sankeyError}</p>
	{:else if sankeyModel.nodes.length === 0}
		<p class="mt-4 rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm text-white/80">No eligible entity actions were returned by MCP catalog.</p>
	{:else}
		<p class="mt-3 text-xs text-white/60">
			Source MCP functions: {mcpFunctionCount} | Sankey nodes: {sankeyModel.nodes.length} | Sankey links: {sankeyModel.links.length}
		</p>
		{#if activeTopologyTab === 'diagram'}
			<div class="mt-4" role="tabpanel" aria-label="Diagram">
				<EntityActionSankey model={sankeyModel} title="Domain → Aggregate Type → Instance ID → Action" />
			</div>
		{:else}
			<div class="mt-4" role="tabpanel" aria-label="Interactive Map">
				<div class="mb-3 flex flex-wrap items-center gap-2 text-xs text-white/70">
					{#if interactiveMapMode === 'root'}
						<span>Click a domain node to drill to aggregate types.</span>
					{:else if interactiveMapMode === 'domain-focused'}
						<span>
							Domain: <span class="font-semibold text-white">{selectedInteractiveDomain}</span> | Click an aggregate type to focus aggregate IDs.
						</span>
					{:else}
						<span>
							Domain: <span class="font-semibold text-white">{selectedInteractiveDomain}</span> |
							Aggregate: <span class="font-semibold text-white">{selectedInteractiveAggregate}</span> | Click an aggregate ID to open Canvas.
						</span>
					{/if}

					{#if interactiveMapMode !== 'root'}
						<button
							type="button"
							class="rounded-md border border-white/35 px-2 py-1 text-xs text-white hover:bg-white/10"
							on:click={resetInteractiveMap}
						>
							Reset map
						</button>
					{/if}
				</div>
				<EntityActionSankey
					model={interactiveMapMode === 'root' ? sankeyModel : interactiveMapModel}
					title="Interactive Map"
					clickableLevels={interactiveMapClickableLevels}
					getNodeTooltip={getInteractiveMapNodeTooltip}
					onNodeClick={handleInteractiveNodeClick}
				/>
			</div>
		{/if}
	{/if}
</div>
