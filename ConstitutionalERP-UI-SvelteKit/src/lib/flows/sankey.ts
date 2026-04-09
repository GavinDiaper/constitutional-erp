import type { EntityActionSankeyLink, EntityActionSankeyModel, EntityActionSankeyNode, McpFunctionSummary } from '$lib/types/hub';

type SankeyLevel = 0 | 1 | 2 | 3;

const DOMAIN_ORDER: Record<string, number> = {
	P2P: 0,
	O2C: 1,
	R2R: 2,
	H2R: 3
};

function normalizeDomain(d: string): string {
	return d.trim().toUpperCase();
}

function domainSort(a: string, b: string): number {
	const ar = DOMAIN_ORDER[a] ?? Number.MAX_SAFE_INTEGER;
	const br = DOMAIN_ORDER[b] ?? Number.MAX_SAFE_INTEGER;
	if (ar !== br) return ar - br;
	return a.localeCompare(b);
}

function addEqualSplitEdges(edges: EntityActionSankeyLink[], source: string, targets: string[]): void {
	if (targets.length === 0) return;
	const value = 1 / targets.length;
	for (const target of targets) {
		edges.push({ source, target, value });
	}
}

function isCreateAction(fn: McpFunctionSummary): boolean {
	return fn.action === 'create' || fn.operationType === 'create';
}

interface EntityGroup {
	domain: string;       // uppercase, e.g. 'O2C'
	entity: string;       // PascalCase, e.g. 'Customer'
	entityKey: string;    // `${domain}|${entity}`
	createActions: string[];   // action names that create new instances (no aggregate ID needed)
	instanceActions: string[]; // action names that operate on existing instances
}

function buildEntityGroups(functions: McpFunctionSummary[]): Map<string, EntityGroup> {
	const map = new Map<string, EntityGroup>();

	for (const fn of functions) {
		if (!fn.domain || !fn.action) continue;

		const domain = normalizeDomain(fn.domain);
		const entity = fn.entity?.trim() || fn.aggregateType?.trim() || 'Unknown';
		const entityKey = `${domain}|${entity}`;

		if (!map.has(entityKey)) {
			map.set(entityKey, { domain, entity, entityKey, createActions: [], instanceActions: [] });
		}

		const group = map.get(entityKey)!;
		const bucket = isCreateAction(fn) ? group.createActions : group.instanceActions;
		if (!bucket.includes(fn.action)) {
			bucket.push(fn.action);
		}
	}

	return map;
}

/**
 * Builds the Sankey model with four logical levels:
 *   0 — Domain (O2C, P2P, R2R, H2R)
 *   1 — Aggregate type (Customer, Requisition, Journal, …)
 *   2 — Live aggregate instance ID (REQ-xxx, QUO-xxx, …)
 *   3 — Action (approve, ship, create, …)
 *
 * Create-type actions (action === 'create') have no existing aggregate ID, so they are
 * linked directly from level 1 → level 3, skipping level 2.
 * All other actions flow through actual instance IDs at level 2 when they are available.
 *
 * @param functions   Normalised MCP function list.
 * @param aggregateIds  Map of `${lowercaseDomain}|${PascalCaseEntity}` → list of live IDs.
 */
export function buildEntityActionSankeyModel(
	functions: McpFunctionSummary[],
	aggregateIds: Map<string, string[]>
): EntityActionSankeyModel {
	const groups = buildEntityGroups(functions);
	if (groups.size === 0) return { nodes: [], links: [] };

	const nodes: EntityActionSankeyNode[] = [];
	const links: EntityActionSankeyLink[] = [];
	const nodeSet = new Set<string>();

	function addNode(id: string, label: string, level: SankeyLevel): void {
		if (!nodeSet.has(id)) {
			nodeSet.add(id);
			nodes.push({ id, label, level });
		}
	}

	// Organise entity groups by domain so we can emit domain → aggregate edges.
	const domainMap = new Map<string, string[]>(); // domain → entityKeys[]
	for (const [entityKey, group] of groups.entries()) {
		if (!domainMap.has(group.domain)) domainMap.set(group.domain, []);
		domainMap.get(group.domain)!.push(entityKey);
	}

	// Level 0: domain nodes. Level 1: aggregate-type nodes. Edges: domain → aggregate type.
	const sortedDomains = Array.from(domainMap.keys()).sort(domainSort);
	for (const domain of sortedDomains) {
		const domainNodeId = `domain:${domain}`;
		addNode(domainNodeId, domain, 0);

		const entityKeys = (domainMap.get(domain) ?? []).sort((a, b) => a.localeCompare(b));
		const aggregateNodeIds: string[] = [];
		for (const entityKey of entityKeys) {
			const aggregateNodeId = `aggregate:${entityKey}`;
			addNode(aggregateNodeId, groups.get(entityKey)!.entity, 1);
			aggregateNodeIds.push(aggregateNodeId);
		}
		addEqualSplitEdges(links, domainNodeId, aggregateNodeIds);
	}

	// Level 2: live instance-ID nodes. Level 3: action nodes.
	// Edges from each aggregate type:
	//   → create-action nodes directly (level 1 → level 3, skipping level 2)
	//   → instance-ID nodes           (level 1 → level 2)
	// Edges from each instance-ID node:
	//   → non-create action nodes     (level 2 → level 3)
	for (const [entityKey, group] of groups.entries()) {
		const aggregateNodeId = `aggregate:${entityKey}`;
		const lookupKey = `${group.domain.toLowerCase()}|${group.entity}`;
		const ids = aggregateIds.get(lookupKey) ?? [];

		// All immediate outgoing targets from the aggregate-type node.
		const aggregateTargets: string[] = [];

		// Create actions → direct link to level-3 action node (no instance ID involved).
		for (const action of [...group.createActions].sort()) {
			const actionNodeId = `action:${entityKey}|${action}`;
			addNode(actionNodeId, action, 3);
			aggregateTargets.push(actionNodeId);
		}

		// Non-create actions → routed through live instance IDs at level 2.
		if (ids.length > 0 && group.instanceActions.length > 0) {
			const sortedActions = [...group.instanceActions].sort();

			// Ensure level-3 action nodes exist for this entity's instance actions.
			const instanceActionNodeIds: string[] = [];
			for (const action of sortedActions) {
				const actionNodeId = `action:${entityKey}|${action}`;
				addNode(actionNodeId, action, 3);
				instanceActionNodeIds.push(actionNodeId);
			}

			for (const id of ids) {
				const instanceNodeId = `instance:${entityKey}|${id}`;
				addNode(instanceNodeId, id, 2);
				aggregateTargets.push(instanceNodeId);
				addEqualSplitEdges(links, instanceNodeId, instanceActionNodeIds);
			}
		}

		addEqualSplitEdges(links, aggregateNodeId, aggregateTargets);
	}

	return { nodes, links };
}
