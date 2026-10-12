<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import ActionList from '$lib/components/canvas/ActionList.svelte';
	import EntityHeader from '$lib/components/canvas/EntityHeader.svelte';
	import EntityOverview from '$lib/components/canvas/EntityOverview.svelte';
	import EventTimeline from '$lib/components/canvas/EventTimeline.svelte';
	import NavigatorPanel from '$lib/components/canvas/NavigatorPanel.svelte';
	import ProcessGraph from '$lib/components/canvas/ProcessGraph.svelte';
	import SimulationPanel from '$lib/components/canvas/SimulationPanel.svelte';
	import MermaidDiagram from '$lib/components/shared/MermaidDiagram.svelte';
	import { getDefaultFlowForDomain, listFlowsByDomain } from '$lib/flows';
	import { domainToCanvasTab, inferDomainFromEntityType, resolveHighlightedStepId } from '$lib/flows/mapping';
	import { executeProcessAction, getProcess } from '$lib/api/process';
	import { fetchHubJson } from '$lib/api/hub';
	import { getActiveContracts, type ContractOption } from '$lib/api/contracts';
	import { assignOrderLineWbs, convertServiceQuote } from '$lib/api/o2c';
	import { queryTable } from '$lib/api/query';
	import { listProjectWbsElements } from '$lib/api/projects';
	import type { ProjectWbsElement } from '$lib/types/projects';
	import { actorStore } from '$lib/stores/actorStore';
	import { processStore } from '$lib/stores/processStore';
	import type { HubActionLink, ProcessGraphModel, TimelineEvent } from '$lib/types/hub';

	type FlowViewMode = 'mermaid' | 'list' | 'hidden';

	let loading = false;
	let errorMessage = '';
	let executingActionName = '';
	let actionErrorMessage = '';
	let actionSuccessMessage = '';
	let entityLines: Array<Record<string, unknown>> = [];
	let contractOptions: ContractOption[] = [];
	let selectedContractVersionId = '';
	let convertingServiceQuote = false;
	let serviceProjectOptions: Array<{ project_id: string; name: string; wbs_id?: string }> = [];
	let selectedProjectByLine: Record<string, string> = {};
	let selectedWbsByLine: Record<string, string> = {};
	let wbsOptionsByLine: Record<string, ProjectWbsElement[]> = {};
	let mappingLineId = '';

	$: entityType = $page.params.entityType;
	$: entityId = $page.params.entityId;
	$: resolvedEntityType = entityType ?? '';
	$: resolvedEntityId = entityId ?? '';

	$: processGraphModel = buildProcessGraph($processStore.state, $processStore._links);
	$: timelineEvents = buildTimeline($processStore.state, $processStore._links);
	$: actions = Object.entries($processStore._links)
		.filter(([name]) => name !== 'self')
		.map(([name, link]) => ({ name, link }));
	$: normalizedEntityType = resolvedEntityType.toLowerCase();
	$: isQuoteEntity = normalizedEntityType === 'o2c_quote' || normalizedEntityType === 'quote';
	$: isOrderEntity = ['o2c_sales_order', 'sales-order', 'salesorder'].includes(normalizedEntityType);
	$: serviceQuoteLines = isQuoteEntity ? entityLines.filter((line) => line.sku_type === 'service') : [];
	$: serviceOrderLines = isOrderEntity ? entityLines.filter((line) => line.sku_type === 'service') : [];
	$: hasServiceQuote = serviceQuoteLines.length > 0 && $processStore.state.toLowerCase() === 'accepted';
	$: hasServiceOrder = serviceOrderLines.length > 0;
	$: allServiceLinesMapped = serviceOrderLines.length > 0 && serviceOrderLines.every((line) =>
		Boolean(line.project_id && line.wbs_element_id && line.contract_version_id === $processStore.attributes.contract_version_id)
	);
	$: quoteConversionAction = actions.find((action) => /convert/i.test(action.name));
	$: orderConfirmationAction = actions.find((action) => /confirm/i.test(action.name));
	$: visibleActions = actions.filter((action) => {
		if (hasServiceQuote && /convert/i.test(action.name)) return false;
		if (hasServiceOrder && /confirm/i.test(action.name)) return false;
		return true;
	});
	$: inferredFlowDomain = inferDomainFromEntityType(resolvedEntityType);
	$: domainFlows = inferredFlowDomain ? listFlowsByDomain(inferredFlowDomain) : [];
	$: selectedVariant = $page.url.searchParams.get('flow') ?? (inferredFlowDomain ? getDefaultFlowForDomain(inferredFlowDomain)?.variantKey ?? 'base' : 'base');
	$: selectedFlowView = (($page.url.searchParams.get('flowView') as FlowViewMode | null) ?? 'list');
	$: selectedDomainFlow = domainFlows.find((flow) => flow.variantKey === selectedVariant) ?? domainFlows[0] ?? null;
	$: highlightedFlowStepId = resolveHighlightedStepId(selectedDomainFlow, $processStore.state, $processStore._links);
	$: selectedDomainFlowMermaid = buildFlowMermaidDefinition(selectedDomainFlow);
	$: flowDeepLinkHref = inferredFlowDomain
		? resolve(
				`/canvas?tab=${domainToCanvasTab(inferredFlowDomain)}&flow=${selectedDomainFlow?.variantKey ?? 'base'}&flowView=${selectedFlowView}${highlightedFlowStepId ? `&highlight=${encodeURIComponent(highlightedFlowStepId)}` : ''}`
			)
		: resolve('/canvas');

	function sanitizeMermaidLabel(value: string): string {
		return value.replace(/"/g, '\\"').replace(/\|/g, '/').trim();
	}

	function buildFlowMermaidDefinition(flow: (typeof selectedDomainFlow) | null): string {
		if (!flow || flow.nodes.length === 0) {
			return 'sequenceDiagram\n  Note over System: No flow available';
		}

		const lines: string[] = ['sequenceDiagram'];
		const refById = new SvelteMap<string, string>();

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
		}

		return lines.join('\n');
	}

	onMount(() => {
		const unsubscribeActor = actorStore.subscribe(() => {
			void loadProcess();
		});

		const unsubscribePage = page.subscribe(() => {
			void loadProcess();
		});

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
			const fallbackAttributes = await loadEntityAttributesFallback(resolvedEntityType, resolvedEntityId);
			processStore.set({
				...process,
				attributes: fallbackAttributes ? mergeProcessAttributes(process.attributes, fallbackAttributes) : process.attributes
			});
			entityLines = await loadEntityLines(resolvedEntityType, resolvedEntityId);
			await loadServiceWorkflowOptions($processStore.attributes);
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Unable to load process data.';
		} finally {
			loading = false;
		}
	}

	function getAttributeString(attributes: Record<string, unknown>, ...keys: string[]): string {
		for (const key of keys) {
			const value = attributes[key];
			if (typeof value === 'string' && value.trim()) return value;
		}
		return '';
	}

	function isWbsUsedByAnotherLine(wbsElementId: string, currentLineId: string): boolean {
		return serviceOrderLines.some((line) =>
			String(line.order_line_id ?? '') !== currentLineId &&
			(String(line.wbs_element_id ?? '') === wbsElementId ||
				selectedWbsByLine[String(line.order_line_id ?? '')] === wbsElementId)
		);
	}

	function handleConfirmServiceOrder(): void {
		if (orderConfirmationAction && allServiceLinesMapped) {
			void runAction(orderConfirmationAction, {});
		}
	}

	async function loadServiceWorkflowOptions(attributes: Record<string, unknown>): Promise<void> {
		contractOptions = [];
		selectedContractVersionId = '';
		serviceProjectOptions = [];
		wbsOptionsByLine = {};
		selectedProjectByLine = {};
		selectedWbsByLine = {};

		if (isQuoteEntity && entityLines.some((line) => line.sku_type === 'service')) {
			const customerId = getAttributeString(attributes, 'customer_id', 'customerId');
			if (customerId) {
				try {
					contractOptions = (await getActiveContracts($actorStore, customerId)).data ?? [];
				} catch (error) {
					actionErrorMessage = error instanceof Error ? error.message : 'Unable to load approved contracts.';
				}
			}
			return;
		}

		if (!isOrderEntity || !entityLines.some((line) => line.sku_type === 'service')) return;
		const customerId = getAttributeString(attributes, 'customer_id', 'customerId');
		const contractVersionId = getAttributeString(attributes, 'contract_version_id', 'contractVersionId');
		if (!customerId || !contractVersionId) return;
		try {
			const rows = await queryTable<Record<string, unknown>>('proj_project', $actorStore, 500, 0);
			serviceProjectOptions = (rows.data ?? [])
				.filter((project) => project.customer_id === customerId && project.project_type === 'Service' &&
					project.contract_version_id === contractVersionId && !['Completed', 'Cancelled'].includes(String(project.status)))
				.map((project) => ({
					project_id: String(project.project_id),
					name: String(project.name ?? project.project_id),
					wbs_id: typeof project.wbs_id === 'string' ? project.wbs_id : undefined
				}));
			for (const line of serviceOrderLines) {
				const lineId = String(line.order_line_id ?? '');
				const existingProjectId = typeof line.project_id === 'string' ? line.project_id : '';
				selectedProjectByLine[lineId] = existingProjectId;
				if (existingProjectId) {
					await loadLineWbsOptions(
						lineId,
						existingProjectId,
						typeof line.wbs_element_id === 'string' ? line.wbs_element_id : '',
						typeof line.sku_id === 'string' ? line.sku_id : ''
					);
				}
			}
		} catch (error) {
			actionErrorMessage = error instanceof Error ? error.message : 'Unable to load matching Service projects.';
		}
	}

	async function loadLineWbsOptions(lineId: string, projectId: string, selectedWbsId = '', skuId = ''): Promise<void> {
		selectedProjectByLine[lineId] = projectId;
		selectedWbsByLine[lineId] = selectedWbsId;
		try {
			const result = await listProjectWbsElements($actorStore, projectId);
			wbsOptionsByLine[lineId] = (result.data ?? []).filter((element) =>
				!['Completed', 'Cancelled'].includes(element.status) && (!element.deliverableSkuId || element.deliverableSkuId === skuId)
			);
		} catch (error) {
			actionErrorMessage = error instanceof Error ? error.message : 'Unable to load WBS elements.';
			wbsOptionsByLine[lineId] = [];
		}
	}

	async function handleConvertServiceQuote(): Promise<void> {
		if (!selectedContractVersionId || !resolvedEntityId) return;
		convertingServiceQuote = true;
		actionErrorMessage = '';
		actionSuccessMessage = '';
		try {
			const result = await convertServiceQuote($actorStore, resolvedEntityId, selectedContractVersionId);
			const orderId = result.data.order_id;
			if (typeof orderId !== 'string') throw new Error('Converted order ID was not returned');
			await goto(resolve(`/canvas/o2c_sales_order/${orderId}`));
		} catch (error) {
			actionErrorMessage = error instanceof Error ? error.message : 'Failed to convert Service quote.';
		} finally {
			convertingServiceQuote = false;
		}
	}

	async function handleAssignLineWbs(line: Record<string, unknown>): Promise<void> {
		const lineId = String(line.order_line_id ?? '');
		const projectId = selectedProjectByLine[lineId] ?? '';
		const wbsElementId = selectedWbsByLine[lineId] ?? '';
		if (!lineId || !projectId || !wbsElementId) return;
		mappingLineId = lineId;
		actionErrorMessage = '';
		actionSuccessMessage = '';
		try {
			await assignOrderLineWbs($actorStore, resolvedEntityId, lineId, { projectId, wbsElementId });
			actionSuccessMessage = `Mapped service line ${lineId}.`;
			await loadProcess();
		} catch (error) {
			actionErrorMessage = error instanceof Error ? error.message : 'Failed to map service line.';
		} finally {
			mappingLineId = '';
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
		if (normalized === 'o2c_quote' || normalized === 'quote') {
			return `/api/v1/o2c/quotes/${entityIdValue}/lines`;
		}
		if (normalized === 'o2c_sales_order' || normalized === 'sales-order' || normalized === 'salesorder') {
			return `/api/v1/o2c/orders/${entityIdValue}/lines`;
		}
		if (normalized === 'o2c_invoice' || normalized === 'invoice' || normalized === 'ar-invoice') {
			return `/api/v1/o2c/invoices/${entityIdValue}/lines`;
		}
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

	function mergeProcessAttributes(
		primary: Record<string, unknown>,
		fallback: Record<string, unknown>
	): Record<string, unknown> {
		const merged: Record<string, unknown> = { ...primary };

		for (const [key, value] of Object.entries(fallback)) {
			if (!(key in merged) || merged[key] === null || merged[key] === undefined || merged[key] === '') {
				merged[key] = value;
			}
		}

		if ((merged.legal_entity_id === null || merged.legal_entity_id === undefined || merged.legal_entity_id === '') && fallback.legal_entity_id) {
			merged.legal_entity_id = fallback.legal_entity_id;
		}

		if ((merged.legalEntityId === null || merged.legalEntityId === undefined || merged.legalEntityId === '') && fallback.legalEntityId) {
			merged.legalEntityId = fallback.legalEntityId;
		}

		const aliasPairs: Array<[string, string]> = [
			['legal_entity_id', 'legalEntityId'],
			['customer_id', 'customerId'],
			['currency_code', 'currencyCode'],
			['project_id', 'projectId'],
			['wbs_id', 'wbsId'],
			['contract_version_id', 'contractVersionId'],
			['quote_id', 'quoteId']
		];

		for (const [snakeKey, camelKey] of aliasPairs) {
			const snakeValue = merged[snakeKey];
			const camelValue = merged[camelKey];
			const hasSnakeValue = snakeValue !== null && snakeValue !== undefined && snakeValue !== '';
			const hasCamelValue = camelValue !== null && camelValue !== undefined && camelValue !== '';

			if (hasSnakeValue) {
				delete merged[camelKey];
				continue;
			}

			if (hasCamelValue) {
				merged[snakeKey] = camelValue;
				delete merged[camelKey];
			}
		}

		return merged;
	}

	async function loadEntityAttributesFallback(
		entityTypeValue: string,
		entityIdValue: string
	): Promise<Record<string, unknown> | null> {
		const normalized = entityTypeValue.toLowerCase();
		if (
			normalized !== 'o2c_quote' &&
			normalized !== 'quote' &&
			normalized !== 'o2c_sales_order' &&
			normalized !== 'sales-order' &&
			normalized !== 'salesorder'
		) {
			return null;
		}

		const queryPath =
			normalized === 'o2c_quote' || normalized === 'quote'
				? `/api/hub/query/o2c_quote/${entityIdValue}`
				: `/api/hub/query/o2c_sales_order/${entityIdValue}`;

		try {
			const payload = await fetchHubJson<Record<string, unknown> | { data?: unknown }>(
				queryPath,
				$actorStore
			);

			if (!payload || typeof payload !== 'object') {
				return null;
			}

			if ('data' in payload && payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data)) {
				return payload.data as Record<string, unknown>;
			}

			return payload as Record<string, unknown>;
		} catch {
			return null;
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

		{#if hasServiceQuote}
			<section class="glass-panel space-y-4 p-4">
				<div>
					<h2 class="text-base font-semibold">Convert Service Quote</h2>
					<p class="muted mt-1 text-sm">Choose an active approved contract for this quote’s customer.</p>
				</div>
				<div class="flex flex-wrap items-end gap-3">
					<label class="min-w-[16rem] flex-1">
						<span class="mb-1 block text-sm font-medium">Contract version</span>
						<select bind:value={selectedContractVersionId} class="input-base w-full">
							<option value="">Select an approved contract</option>
							{#each contractOptions as contract (contract.contractVersionId)}
								<option value={contract.contractVersionId}>
									{contract.name} · {contract.externalReference || contract.contractId} · v{contract.versionNumber} · {contract.contractValue} {contract.currencyCode}
								</option>
							{/each}
						</select>
					</label>
					<button
						on:click={() => void handleConvertServiceQuote()}
						class="rounded bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
						disabled={!selectedContractVersionId || convertingServiceQuote || contractOptions.length === 0}
					>
						{convertingServiceQuote ? 'Converting...' : 'Convert to Sales Order'}
					</button>
				</div>
				{#if contractOptions.length === 0}
					<p class="muted text-sm">No active approved contracts are available for this customer.</p>
				{/if}
			</section>
		{/if}

		{#if hasServiceOrder}
			<section class="glass-panel space-y-4 p-4">
				<div class="flex flex-wrap items-start justify-between gap-3">
					<div>
						<h2 class="text-base font-semibold">Service Line Delivery Mapping</h2>
						<p class="muted mt-1 text-sm">
							Map each service line to a project and a WBS element pinned to this order’s contract version.
						</p>
					</div>
					<span class="rounded border dark:border-white/20 border-slate-300 px-2 py-1 text-xs">
						{serviceOrderLines.filter((line) => Boolean(line.wbs_element_id)).length} / {serviceOrderLines.length} mapped
					</span>
				</div>
				<div class="overflow-x-auto">
					<table class="w-full text-left text-sm">
						<thead class="border-b dark:border-white/15 border-slate-200 text-xs uppercase dark:text-white/70 text-slate-600">
							<tr>
								<th class="px-2 py-2">Service line</th>
								<th class="px-2 py-2">Project</th>
								<th class="px-2 py-2">WBS element</th>
								<th class="px-2 py-2">Mapping</th>
							</tr>
						</thead>
						<tbody>
							{#each serviceOrderLines as line (String(line.order_line_id))}
								{@const lineId = String(line.order_line_id)}
								<tr class="border-b dark:border-white/10 border-slate-200 align-top">
									<td class="px-2 py-3">
										<div class="font-medium">{String(line.sku ?? 'Service SKU')}</div>
										<div class="muted text-xs">{String(line.quantity ?? '')} × {String(line.unit_price ?? '')}</div>
									</td>
									<td class="min-w-52 px-2 py-3">
										<select
											class="input-base w-full"
											value={selectedProjectByLine[lineId] ?? ''}
											disabled={$processStore.state.toLowerCase() !== 'draft' || mappingLineId === lineId}
											on:change={(event) => void loadLineWbsOptions(
												lineId,
												(event.currentTarget as HTMLSelectElement).value,
												'',
												typeof line.sku_id === 'string' ? line.sku_id : ''
											)}
										>
											<option value="">Select a Service project</option>
											{#each serviceProjectOptions as project (project.project_id)}
												<option value={project.project_id}>{project.name} ({project.project_id})</option>
											{/each}
										</select>
									</td>
									<td class="min-w-56 px-2 py-3">
										<select
											class="input-base w-full"
											bind:value={selectedWbsByLine[lineId]}
											disabled={$processStore.state.toLowerCase() !== 'draft' || !selectedProjectByLine[lineId] || mappingLineId === lineId}
										>
											<option value="">Select a WBS element</option>
											{#each wbsOptionsByLine[lineId] ?? [] as element (element.wbsElementId)}
												{#if !isWbsUsedByAnotherLine(element.wbsElementId, lineId)}
													<option value={element.wbsElementId}>{element.wbsCode} · {element.name}</option>
												{/if}
											{/each}
										</select>
									</td>
									<td class="px-2 py-3">
										{#if $processStore.state.toLowerCase() === 'draft'}
											<button
												on:click={() => void handleAssignLineWbs(line)}
												class="rounded border dark:border-white/25 border-slate-300 px-3 py-2 text-xs font-medium disabled:opacity-50"
												disabled={!selectedProjectByLine[lineId] || !selectedWbsByLine[lineId] || mappingLineId === lineId}
											>
												{mappingLineId === lineId ? 'Saving...' : line.wbs_element_id ? 'Update mapping' : 'Map line'}
											</button>
										{:else if line.wbs_element_id}
											<span class="text-xs text-emerald-700 dark:text-emerald-300">Mapped</span>
										{:else}
											<span class="text-xs text-amber-700 dark:text-amber-300">Needs mapping</span>
										{/if}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
				{#if $processStore.state.toLowerCase() === 'draft'}
					<div class="flex flex-wrap items-center justify-between gap-3 border-t dark:border-white/15 border-slate-200 pt-4">
						<p class="muted text-sm">
							{allServiceLinesMapped ? 'All service lines are mapped.' : 'Map every service line before confirming this order.'}
						</p>
						<button
							on:click={handleConfirmServiceOrder}
							class="rounded bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
							disabled={!allServiceLinesMapped || !orderConfirmationAction || executingActionName !== ''}
						>
							Confirm Sales Order
						</button>
					</div>
				{/if}
			</section>
		{/if}

		<div class="grid gap-4 xl:grid-cols-2">
			<EntityOverview attributes={{ ...$processStore.attributes, __entityType: resolvedEntityType, __lines: entityLines }} />
			<ActionList actions={visibleActions} onExecute={runAction} {executingActionName} />
		</div>

		<div class="grid gap-4 xl:grid-cols-2">
			<ProcessGraph model={processGraphModel} />
			<EventTimeline events={timelineEvents} />
		</div>

		{#if inferredFlowDomain}
			<div class="rounded-lg border dark:border-white/15 border-slate-200 dark:bg-white/5 bg-slate-100/60 p-4">
				<div class="flex flex-wrap items-center justify-between gap-2">
					<div>
						<h3 class="text-sm font-semibold dark:text-white text-slate-900">Domain Flow Context</h3>
						<p class="muted mt-1 text-xs">
							{inferredFlowDomain} flow derived from Postman end-to-end sequence.
						</p>
					</div>
					<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
					<a class="rounded-md border dark:border-white/25 border-slate-300 px-2 py-1 text-xs dark:text-white/85 text-slate-700 dark:hover:bg-white/10 hover:bg-slate-500/10" href={flowDeepLinkHref}>
						Open flow explorer
					</a>
				</div>

				{#if domainFlows.length > 1}
					<div class="mt-3 flex flex-wrap gap-2 text-xs">
						{#each domainFlows as flow (flow.id)}
							<a
								class={`rounded-md border px-2 py-1 ${selectedDomainFlow?.id === flow.id ? 'border-sky-200 bg-sky-400/20 text-sky-100' : 'dark:border-white/20 border-slate-300 dark:text-white/80 text-slate-700 dark:hover:bg-white/10 hover:bg-slate-500/10'}`}
								href={resolve(`/canvas/${resolvedEntityType}/${resolvedEntityId}?flow=${flow.variantKey}&flowView=${selectedFlowView}`)}
							>
								{flow.variantLabel}
							</a>
						{/each}
					</div>
				{/if}

				<div class="mt-3 flex flex-wrap gap-2 text-xs">
					<a
						class={`rounded-md border px-2 py-1 ${selectedFlowView === 'mermaid' ? 'border-sky-200 bg-sky-400/20 text-sky-100' : 'dark:border-white/20 border-slate-300 dark:text-white/80 text-slate-700 dark:hover:bg-white/10 hover:bg-slate-500/10'}`}
						href={resolve(`/canvas/${resolvedEntityType}/${resolvedEntityId}?flow=${selectedVariant}&flowView=mermaid`)}
					>
						Mermaid diagram
					</a>
					<a
						class={`rounded-md border px-2 py-1 ${selectedFlowView === 'list' ? 'border-sky-200 bg-sky-400/20 text-sky-100' : 'dark:border-white/20 border-slate-300 dark:text-white/80 text-slate-700 dark:hover:bg-white/10 hover:bg-slate-500/10'}`}
						href={resolve(`/canvas/${resolvedEntityType}/${resolvedEntityId}?flow=${selectedVariant}&flowView=list`)}
					>
						List view
					</a>
					<a
						class={`rounded-md border px-2 py-1 ${selectedFlowView === 'hidden' ? 'border-sky-200 bg-sky-400/20 text-sky-100' : 'dark:border-white/20 border-slate-300 dark:text-white/80 text-slate-700 dark:hover:bg-white/10 hover:bg-slate-500/10'}`}
						href={resolve(`/canvas/${resolvedEntityType}/${resolvedEntityId}?flow=${selectedVariant}&flowView=hidden`)}
					>
						Hide flows
					</a>
				</div>

				{#if selectedFlowView === 'hidden'}
					<p class="mt-3 text-xs dark:text-white/75 text-slate-700">Flow display is hidden for this entity view.</p>
				{:else if selectedFlowView === 'mermaid'}
					<div class="mt-3 rounded border dark:border-white/20 border-slate-300 bg-slate-950/20 p-2">
						<MermaidDiagram definition={selectedDomainFlowMermaid} title="Entity-aligned flow" fontSize={44} />
					</div>
				{:else if selectedDomainFlow}
					<ol class="mt-3 space-y-2 text-xs">
						{#each selectedDomainFlow.nodes as node (node.id)}
							<li class={`rounded border px-2 py-2 ${node.id === highlightedFlowStepId ? 'border-amber-300/70 bg-amber-300/10' : 'dark:border-white/20 border-slate-300 bg-slate-950/20'}`}>
								<div class="font-semibold dark:text-white text-slate-900">{node.sequence}. {node.requestName}</div>
								<div class="mt-1 dark:text-white/75 text-slate-700">{node.httpMethod} {node.requestPath}</div>
							</li>
						{/each}
					</ol>
				{/if}
			</div>
		{/if}

		<div class="grid gap-4 xl:grid-cols-2">
			<NavigatorPanel />
			<SimulationPanel />
		</div>
	</div>
{/if}
