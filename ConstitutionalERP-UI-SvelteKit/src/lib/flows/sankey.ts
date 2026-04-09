import type { EntityActionSankeyModel, McpFunctionSummary } from '$lib/types/hub';

type SankeyLevel = 0 | 1 | 2 | 3;

const DOMAIN_ORDER: Record<string, number> = {
	P2P: 0,
	O2C: 1,
	R2R: 2,
	H2R: 3
};

interface GroupedEntry {
	domain: string;
	aggregateType: string;
	entity: string;
	action: string;
}

interface EdgeDraft {
	source: string;
	target: string;
	value: number;
}

function normalizeDomain(domain: string): string {
	return domain.trim().toUpperCase();
}

function normalizeLabel(value: string): string {
	return value.trim();
}

function aggregateLabel(value: string): string {
	return normalizeLabel(value);
}

function actionLabel(value: string): string {
	return normalizeLabel(value);
}

function entityLabel(value: string): string {
	return normalizeLabel(value);
}

function domainSort(left: string, right: string): number {
	const leftRank = DOMAIN_ORDER[left] ?? Number.MAX_SAFE_INTEGER;
	const rightRank = DOMAIN_ORDER[right] ?? Number.MAX_SAFE_INTEGER;
	if (leftRank !== rightRank) {
		return leftRank - rightRank;
	}
	return left.localeCompare(right);
}

function toNodeId(level: SankeyLevel, value: string): string {
	switch (level) {
		case 0:
			return `domain:${value}`;
		case 1:
			return `aggregate:${value}`;
		case 2:
			return `entity:${value}`;
		default:
			return `action:${value}`;
	}
}

function addEdgeWithEqualSplit(
	drafts: EdgeDraft[],
	sourceNodeId: string,
	targetNodeIds: string[]
): void {
	if (targetNodeIds.length === 0) {
		return;
	}

	const value = 1 / targetNodeIds.length;
	for (const targetNodeId of targetNodeIds) {
		drafts.push({ source: sourceNodeId, target: targetNodeId, value });
	}
}

function uniqueSorted(values: Iterable<string>): string[] {
	return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));
}

function groupFunctions(functions: McpFunctionSummary[]): GroupedEntry[] {
	const dedupe = new Set<string>();
	const entries: GroupedEntry[] = [];

	for (const fn of functions) {
		if (!fn.domain || !fn.action) {
			continue;
		}

		const domain = normalizeDomain(fn.domain);
		const aggregateType = aggregateLabel(fn.aggregateType ?? fn.entity ?? 'unknown-aggregate');
		const entity = entityLabel(fn.entity ?? fn.aggregateType ?? 'UnknownEntity');
		const action = actionLabel(fn.action);

		if (!domain || !aggregateType || !entity || !action) {
			continue;
		}

		const key = `${domain}||${aggregateType}||${entity}||${action}`;
		if (dedupe.has(key)) {
			continue;
		}

		dedupe.add(key);
		entries.push({ domain, aggregateType, entity, action });
	}

	return entries.sort((left, right) => {
		const domainOrder = domainSort(left.domain, right.domain);
		if (domainOrder !== 0) {
			return domainOrder;
		}

		const aggregateOrder = left.aggregateType.localeCompare(right.aggregateType);
		if (aggregateOrder !== 0) {
			return aggregateOrder;
		}

		const entityOrder = left.entity.localeCompare(right.entity);
		if (entityOrder !== 0) {
			return entityOrder;
		}

		return left.action.localeCompare(right.action);
	});
}

export function buildEntityActionSankeyModel(functions: McpFunctionSummary[]): EntityActionSankeyModel {
	const groupedEntries = groupFunctions(functions);
	if (groupedEntries.length === 0) {
		return { nodes: [], links: [] };
	}

	const domainToAggregates = new Map<string, Set<string>>();
	const aggregateToEntities = new Map<string, Set<string>>();
	const entityToActions = new Map<string, Set<string>>();

	for (const entry of groupedEntries) {
		const aggregateKey = `${entry.domain}|${entry.aggregateType}`;
		const entityKey = `${aggregateKey}|${entry.entity}`;

		if (!domainToAggregates.has(entry.domain)) {
			domainToAggregates.set(entry.domain, new Set<string>());
		}
		domainToAggregates.get(entry.domain)?.add(aggregateKey);

		if (!aggregateToEntities.has(aggregateKey)) {
			aggregateToEntities.set(aggregateKey, new Set<string>());
		}
		aggregateToEntities.get(aggregateKey)?.add(entityKey);

		if (!entityToActions.has(entityKey)) {
			entityToActions.set(entityKey, new Set<string>());
		}
		entityToActions.get(entityKey)?.add(entry.action);
	}

	const nodes = [
		...Array.from(domainToAggregates.keys())
			.sort(domainSort)
			.map((domain) => ({ id: toNodeId(0, domain), label: domain, level: 0 as const })),
		...Array.from(aggregateToEntities.keys())
			.sort((left, right) => left.localeCompare(right))
			.map((aggregateKey) => {
				const [, aggregateType] = aggregateKey.split('|');
				return {
					id: toNodeId(1, aggregateKey),
					label: aggregateType,
					level: 1 as const
				};
			}),
		...Array.from(entityToActions.keys())
			.sort((left, right) => left.localeCompare(right))
			.map((entityKey) => {
				const segments = entityKey.split('|');
				const entity = segments[2] ?? entityKey;
				return {
					id: toNodeId(2, entityKey),
					label: entity,
					level: 2 as const
				};
			}),
		...uniqueSorted(
			groupedEntries.map((entry) => `${entry.domain}|${entry.aggregateType}|${entry.entity}|${entry.action}`)
		).map((actionKey) => {
			const segments = actionKey.split('|');
			const action = segments[3] ?? actionKey;
			return {
				id: toNodeId(3, actionKey),
				label: action,
				level: 3 as const
			};
		})
	];

	const edgeDrafts: EdgeDraft[] = [];

	for (const [domain, aggregateSet] of domainToAggregates.entries()) {
		const targetNodeIds = uniqueSorted(aggregateSet).map((aggregateKey) => toNodeId(1, aggregateKey));
		addEdgeWithEqualSplit(edgeDrafts, toNodeId(0, domain), targetNodeIds);
	}

	for (const [aggregateKey, entitySet] of aggregateToEntities.entries()) {
		const targetNodeIds = uniqueSorted(entitySet).map((entityKey) => toNodeId(2, entityKey));
		addEdgeWithEqualSplit(edgeDrafts, toNodeId(1, aggregateKey), targetNodeIds);
	}

	for (const [entityKey, actionSet] of entityToActions.entries()) {
		const segments = entityKey.split('|');
		const [domain, aggregateType, entity] = segments;
		const targetNodeIds = uniqueSorted(actionSet).map((action) => toNodeId(3, `${domain}|${aggregateType}|${entity}|${action}`));
		addEdgeWithEqualSplit(edgeDrafts, toNodeId(2, entityKey), targetNodeIds);
	}

	const links = edgeDrafts.sort((left, right) => {
		const sourceOrder = left.source.localeCompare(right.source);
		if (sourceOrder !== 0) {
			return sourceOrder;
		}
		return left.target.localeCompare(right.target);
	});

	return {
		nodes,
		links
	};
}
