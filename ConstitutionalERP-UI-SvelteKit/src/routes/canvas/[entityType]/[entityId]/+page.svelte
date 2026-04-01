<script lang="ts">
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import ActionList from '$lib/components/canvas/ActionList.svelte';
	import EntityHeader from '$lib/components/canvas/EntityHeader.svelte';
	import EntityOverview from '$lib/components/canvas/EntityOverview.svelte';
	import EventTimeline from '$lib/components/canvas/EventTimeline.svelte';
	import NavigatorPanel from '$lib/components/canvas/NavigatorPanel.svelte';
	import ProcessGraph from '$lib/components/canvas/ProcessGraph.svelte';
	import SimulationPanel from '$lib/components/canvas/SimulationPanel.svelte';
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

	function resolveLinesHref(entityTypeValue: string, entityIdValue: string): string | null {
		const normalized = entityTypeValue.toLowerCase();
		if (normalized === 'p2p_requisition' || normalized === 'requisition') {
			return `/api/v1/p2p/requisitions/${entityIdValue}/lines`;
		}
		if (normalized === 'p2p_purchase_order' || normalized === 'purchase-order' || normalized === 'purchaseorder') {
			return `/api/v1/p2p/purchase-orders/${entityIdValue}/lines`;
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
			if (Array.isArray(payload)) {
				return payload as Array<Record<string, unknown>>;
			}
			if (Array.isArray(payload?.data)) {
				return payload.data as Array<Record<string, unknown>>;
			}
			return [];
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

		<div class="grid gap-4 xl:grid-cols-2">
			<NavigatorPanel />
			<SimulationPanel />
		</div>
	</div>
{/if}
