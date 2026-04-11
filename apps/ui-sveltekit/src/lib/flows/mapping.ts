import type { CanonicalFlowDomain, HubActionLink, ProcessFlowDefinition } from '$lib/types/hub';

function normalizeToken(value: string): string {
	return value.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

export function inferDomainFromEntityType(entityType: string): CanonicalFlowDomain | null {
	const normalized = entityType.toLowerCase();
	if (normalized.startsWith('o2c_') || normalized === 'quote' || normalized === 'order' || normalized === 'invoice') {
		return 'O2C';
	}
	if (normalized.startsWith('p2p_') || normalized === 'requisition' || normalized === 'purchase-order') {
		return 'P2P';
	}
	if (normalized.startsWith('r2r_') || normalized === 'journal' || normalized === 'fiscal-period') {
		return 'R2R';
	}
	if (normalized.startsWith('h2r_') || normalized === 'employee' || normalized === 'assignment') {
		return 'H2R';
	}
	return null;
}

export function domainToCanvasTab(domain: CanonicalFlowDomain): 'o2c' | 'p2p' | 'r2r' | 'hcm' {
	switch (domain) {
		case 'O2C':
			return 'o2c';
		case 'P2P':
			return 'p2p';
		case 'R2R':
			return 'r2r';
		default:
			return 'hcm';
	}
}

export function resolveHighlightedStepId(
	flow: ProcessFlowDefinition | null,
	state: string,
	links: Record<string, HubActionLink>
): string | null {
	if (!flow || flow.nodes.length === 0) {
		return null;
	}

	const actionNames = Object.keys(links)
		.filter((name) => name !== 'self')
		.map((name) => normalizeToken(name));

	for (const node of flow.nodes) {
		const normalizedAction = normalizeToken(node.action);
		if (actionNames.includes(normalizedAction)) {
			return node.id;
		}
	}

	const normalizedState = normalizeToken(state);
	for (const node of flow.nodes) {
		if (normalizeToken(node.requestName).includes(normalizedState)) {
			return node.id;
		}
	}

	return flow.nodes[0]?.id ?? null;
}
