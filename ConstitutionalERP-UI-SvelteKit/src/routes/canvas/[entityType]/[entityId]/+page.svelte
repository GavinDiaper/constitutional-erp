<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import ActionList from '$lib/components/canvas/ActionList.svelte';
	import CompactFlowGraph from '$lib/components/canvas/CompactFlowGraph.svelte';
	import EntityHeader from '$lib/components/canvas/EntityHeader.svelte';
	import EntityOverview from '$lib/components/canvas/EntityOverview.svelte';
	import EventTimeline from '$lib/components/canvas/EventTimeline.svelte';
	import NavigatorPanel from '$lib/components/canvas/NavigatorPanel.svelte';
	import ProcessGraph from '$lib/components/canvas/ProcessGraph.svelte';
	import SimulationPanel from '$lib/components/canvas/SimulationPanel.svelte';
	import { getDefaultFlowForDomain, listFlowsByDomain } from '$lib/flows';
	import { domainToCanvasTab, inferDomainFromEntityType, resolveHighlightedStepId } from '$lib/flows/mapping';
	import { executeProcessAction, getProcess } from '$lib/api/process';
	import { actorStore } from '$lib/stores/actorStore';
	import { processStore } from '$lib/stores/processStore';
	import type { HubActionLink, ProcessGraphModel, TimelineEvent } from '$lib/types/hub';

	let loading = false;
	let errorMessage = '';
	let executingActionName = '';
	let actionErrorMessage = '';
	let actionSuccessMessage = '';
	let entityLines: Array<Record<string, unknown>> = [];

	$: entityType = $page.params.entityType;
	$: entityId = $page.params.entityId;
	$: resolvedEntityType = entityType ?? '';
	$: resolvedEntityId = entityId ?? '';

	$: processGraphModel = buildProcessGraph($processStore.state, $processStore._links);
	$: timelineEvents = buildTimeline($processStore.state, $processStore._links);
	$: actions = Object.entries($processStore._links)
		.filter(([name]) => name !== 'self')
		.map(([name, link]) => ({ name, link }));
	$: inferredFlowDomain = inferDomainFromEntityType(resolvedEntityType);
	$: domainFlows = inferredFlowDomain ? listFlowsByDomain(inferredFlowDomain) : [];
	$: selectedVariant = $page.url.searchParams.get('flow') ?? (inferredFlowDomain ? getDefaultFlowForDomain(inferredFlowDomain)?.variantKey ?? 'base' : 'base');
	$: selectedDomainFlow = domainFlows.find((flow) => flow.variantKey === selectedVariant) ?? domainFlows[0] ?? null;
	$: highlightedFlowStepId = resolveHighlightedStepId(selectedDomainFlow, $processStore.state, $processStore._links);
	$: flowDeepLinkHref = inferredFlowDomain
		? resolve(
				`/canvas?tab=${domainToCanvasTab(inferredFlowDomain)}&flow=${selectedDomainFlow?.variantKey ?? 'base'}${highlightedFlowStepId ? `&highlight=${encodeURIComponent(highlightedFlowStepId)}` : ''}`
			)
		: resolve('/canvas');

	onMount(() => {
		const unsubscribeActor = actorStore.subscribe(() => {
			void loadProcess();
		});

		const unsubscribePage = page.subscribe(() => {
			void loadProcess();
		});

		void loadProcess();

		return () => {
			unsubscribeActor();
			unsubscribePage();
		};
	});

	async function loadProcess(): Promise<void> {
		if (!resolvedEntityType || !resolvedEntityId) {
			return;
		}

		loading = true;
		errorMessage = '';

		try {
			const process = await getProcess(resolvedEntityType, resolvedEntityId, $actorStore);
			processStore.set(process);
			entityLines = await loadEntityLines(resolvedEntityType, resolvedEntityId);
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Unable to load process data.';
		} finally {
			loading = false;
		}
	}

	async function runAction(action: { name: string; link: HubActionLink }, payload: Record<string, unknown>): Promise<void> {
		executingActionName = action.name;
		actionErrorMessage = '';
		actionSuccessMessage = '';

		try {
			const result = await executeProcessAction(action.link, $actorStore, payload) as Record<string, unknown> | null;
			const target = resolveActionTarget(result);
			if (target && (target.entityType !== resolvedEntityType || target.entityId !== resolvedEntityId)) {
				actionSuccessMessage = `Action "${action.name}" completed. Opening ${target.label} ${target.entityId}.`;
				await goto(resolve(`/canvas/${target.entityType}/${target.entityId}`));
				return;
			}

			actionSuccessMessage = `Action "${action.name}" completed.`;

			// If the action result carries the projected new state and links, apply them
			// directly to avoid reading stale event-processor ledger state via loadProcess().
			if (result && typeof result.newState === 'string' && Array.isArray(result.links)) {
				const projectedLinks = result.links as Array<{ rel: string; href: string; method?: string; mcpFunction?: string; requiredInput?: HubActionLink['inputSchema'] }>;
				const projectedAttributes =
					typeof result.attributes === 'object' && result.attributes
						? (result.attributes as Record<string, unknown>)
						: $processStore.attributes;
				const _links: Record<string, HubActionLink> = {};
				for (const link of projectedLinks) {
					if (link.rel && link.rel !== 'self') {
						_links[link.rel] = { href: link.href, method: link.method ?? 'POST', mcpFunction: link.mcpFunction, inputSchema: link.requiredInput };
					}
				}
				processStore.set({
					entityType: resolvedEntityType,
					entityId: resolvedEntityId,
					state: result.newState,
					attributes: projectedAttributes,
					_links
				});
				entityLines = await loadEntityLines(resolvedEntityType, resolvedEntityId);
			} else {
				await loadProcess();
			}
		} catch (error) {
			actionErrorMessage = error instanceof Error ? error.message : `Action "${action.name}" failed.`;
		} finally {
			executingActionName = '';
		}
	}

	function buildProcessGraph(state: string, links: Record<string, { governance?: { riskLevel?: string } }>): ProcessGraphModel {
		const transitions = Object.keys(links).filter((name) => name !== 'self');
		const nodes = [state || 'unknown', ...transitions].filter((value, index, all) => all.indexOf(value) === index);

		return {
			currentState: state || 'unknown',
			nodes,
			edges: transitions.map((name) => ({
				from: state || 'unknown',
				to: name,
				risk: normalizeRisk(links[name]?.governance?.riskLevel),
				label: name
			}))
		};
	}

	function buildTimeline(state: string, links: Record<string, unknown>): TimelineEvent[] {
		const base = new Date();
		const actionNames = Object.keys(links).filter((name) => name !== 'self');

		return [
			{
				id: `${state || 'state'}-0`,
				timestamp: new Date(base.getTime() - 1000 * 60 * 25).toISOString(),
				category: 'state',
				message: `Entity currently in ${state || 'unknown'} state`,
				severity: 'low'
			},
			...actionNames.slice(0, 4).map((name, index) => ({
				id: `${name}-${index + 1}`,
				timestamp: new Date(base.getTime() - 1000 * 60 * (18 - index * 4)).toISOString(),
				category: 'transition',
				message: `Action available: ${name}`,
				severity: 'medium' as const
			}))
		];
	}

	function normalizeRisk(riskLevel: string | undefined): 'low' | 'medium' | 'high' {
		if (!riskLevel) {
			return 'low';
		}

		const normalized = riskLevel.toLowerCase();
		if (normalized === 'high') {
			return 'high';
		}

		if (normalized === 'medium') {
			return 'medium';
		}

		return 'low';
	}

	function resolveActionTarget(result: Record<string, unknown> | null): { entityType: string; entityId: string; label: string } | null {
		if (!result) {
			return null;
		}

		const selfHref = (result._links as Record<string, { href?: string }> | undefined)?.self?.href;
		if (typeof selfHref === 'string') {
			const parsed = parseHubHref(selfHref);
			if (parsed) {
				return parsed;
			}
		}

		const keyMap = [
			{ key: 'order_id', entityType: 'o2c_sales_order', label: 'sales order' },
			{ key: 'invoice_id', entityType: 'o2c_invoice', label: 'invoice' },
			{ key: 'quote_id', entityType: 'o2c_quote', label: 'quote' },
			{ key: 'payment_id', entityType: 'o2c_payment', label: 'payment' },
			{ key: 'po_id', entityType: 'p2p_purchase_order', label: 'purchase order' },
			{ key: 'receipt_id', entityType: 'p2p_goods_receipt', label: 'goods receipt' },
			{ key: 'supplier_invoice_id', entityType: 'p2p_supplier_invoice', label: 'supplier invoice' },
			{ key: 'ap_payment_id', entityType: 'p2p_ap_payment', label: 'AP payment' }
		];

		for (const candidate of keyMap) {
			const value = result[candidate.key];
			if (typeof value === 'string' && value.trim()) {
				return { entityType: candidate.entityType, entityId: value, label: candidate.label };
			}
		}

		return null;
	}

	function parseHubHref(href: string): { entityType: string; entityId: string; label: string } | null {
		const match = href.match(/^\/api\/v1\/([^/]+)\/([^/]+)\/([^/?#]+)/i);
		if (!match) {
			return null;
		}

		const [, domain, collection, entityId] = match;
		const entityMap: Record<string, { entityType: string; label: string }> = {
			'o2c/customers': { entityType: 'o2c_customer', label: 'customer' },
			'o2c/quotes': { entityType: 'o2c_quote', label: 'quote' },
			'o2c/orders': { entityType: 'o2c_sales_order', label: 'sales order' },
			'o2c/invoices': { entityType: 'o2c_invoice', label: 'invoice' },
			'o2c/payments': { entityType: 'o2c_payment', label: 'payment' },
			'p2p/purchase-orders': { entityType: 'p2p_purchase_order', label: 'purchase order' },
			'p2p/goods-receipts': { entityType: 'p2p_goods_receipt', label: 'goods receipt' },
			'p2p/supplier-invoices': { entityType: 'p2p_supplier_invoice', label: 'supplier invoice' },
			'p2p/ap-payments': { entityType: 'p2p_ap_payment', label: 'AP payment' },
			'r2r/journals': { entityType: 'r2r_journal', label: 'journal' },
			'h2r/employees': { entityType: 'h2r_employee', label: 'employee' }
		};

		return entityMap[`${domain}/${collection}`]
			? { ...entityMap[`${domain}/${collection}`], entityId }
			: null;
	}

	function resolveLinesHref(entityTypeValue: string, entityIdValue: string): string | null {
		const normalized = entityTypeValue.toLowerCase();
		if (normalized === 'p2p_requisition' || normalized === 'requisition') {
			return `/api/v1/p2p/requisitions/${entityIdValue}/lines`;
		}
		if (normalized === 'p2p_purchase_order' || normalized === 'purchase-order' || normalized === 'purchaseorder') {
			return `/api/v1/p2p/purchase-orders/${entityIdValue}/lines`;
		}
		if (normalized === 'r2r_journal' || normalized === 'journal') {
			return '/api/v1/query/r2r_journal_line?limit=500&offset=0';
		}
		return null;
	}

	async function loadEntityLines(entityTypeValue: string, entityIdValue: string): Promise<Array<Record<string, unknown>>> {
		const href = resolveLinesHref(entityTypeValue, entityIdValue);
		if (!href) {
			return [];
		}

		try {
			const response = await fetch('/api/hub/process/action', {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					'x-actor-id': $actorStore.actorId,
					'x-actor-tier': String($actorStore.authorityTier)
				},
				body: JSON.stringify({ href, method: 'GET' })
			});

			if (!response.ok) {
				return [];
			}

			const payload = await response.json();
			let rows: Array<Record<string, unknown>> = [];
			if (Array.isArray(payload)) {
				rows = payload as Array<Record<string, unknown>>;
			}
			if (Array.isArray(payload?.data)) {
				rows = payload.data as Array<Record<string, unknown>>;
			}

			if (entityTypeValue.toLowerCase() === 'r2r_journal') {
				return rows.filter((row) => String(row.journal_id ?? '') === entityIdValue);
			}

			return rows;
		} catch {
			return [];
		}
	}
</script>

{#if loading}
	<div class="glass-panel p-6 text-sm">Loading process data...</div>
{:else if errorMessage}
	<div class="glass-panel border border-red-500/55 p-6 text-sm text-red-200">{errorMessage}</div>
{:else}
	<div class="space-y-4">
		<EntityHeader entityType={resolvedEntityType} entityId={resolvedEntityId} state={$processStore.state} />

		{#if actionErrorMessage}
			<div class="glass-panel border border-red-500/55 p-3 text-sm text-red-200">{actionErrorMessage}</div>
		{:else if actionSuccessMessage}
			<div class="glass-panel border border-emerald-500/55 p-3 text-sm text-emerald-200">{actionSuccessMessage}</div>
		{/if}

		<div class="grid gap-4 xl:grid-cols-2">
			<EntityOverview attributes={{ ...$processStore.attributes, __entityType: resolvedEntityType, __lines: entityLines }} />
			<ActionList {actions} onExecute={runAction} {executingActionName} />
		</div>

		<div class="grid gap-4 xl:grid-cols-2">
			<ProcessGraph model={processGraphModel} />
			<EventTimeline events={timelineEvents} />
		</div>

		{#if inferredFlowDomain}
			<div class="rounded-lg border border-white/15 bg-white/5 p-4">
				<div class="flex flex-wrap items-center justify-between gap-2">
					<div>
						<h3 class="text-sm font-semibold text-white">Domain Flow Context</h3>
						<p class="muted mt-1 text-xs">
							{inferredFlowDomain} flow derived from Postman end-to-end sequence.
						</p>
					</div>
					<a class="rounded-md border border-white/25 px-2 py-1 text-xs text-white/85 hover:bg-white/10" href={flowDeepLinkHref}>
						Open flow explorer
					</a>
				</div>

				{#if domainFlows.length > 1}
					<div class="mt-3 flex flex-wrap gap-2 text-xs">
						{#each domainFlows as flow (flow.id)}
							<a
								class={`rounded-md border px-2 py-1 ${selectedDomainFlow?.id === flow.id ? 'border-sky-200 bg-sky-400/20 text-sky-100' : 'border-white/20 text-white/80 hover:bg-white/10'}`}
								href={resolve(`/canvas/${resolvedEntityType}/${resolvedEntityId}?flow=${flow.variantKey}`)}
							>
								{flow.variantLabel}
							</a>
						{/each}
					</div>
				{/if}

				<div class="mt-3">
					<CompactFlowGraph flow={selectedDomainFlow} highlightedStepId={highlightedFlowStepId} title="Entity-aligned flow" />
				</div>
			</div>
		{/if}

		<div class="grid gap-4 xl:grid-cols-2">
			<NavigatorPanel />
			<SimulationPanel />
		</div>
	</div>
{/if}
